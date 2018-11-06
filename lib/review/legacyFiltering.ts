/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    logger,
    Project,
    ProjectReview,
    ReviewComment,
    SourceLocation,
} from "@atomist/automation-client";
import {
    AutoCodeInspection,
    AutofixRegistration,
    CodeTransformRegistration,
    ExtensionPack,
    FulfillableGoalDetails,
    metadata,
    PushAwareParametersInvocation,
    ReviewerRegistration,
    WellKnownGoals,
} from "@atomist/sdm";

/**
 * Make this AutoInspect goal filter out legacy issues. Combine with
 * legacy autofix.
 * @param {AutoCodeInspection} inspectGoal
 * @return {AutoCodeInspection}
 */
export function withLegacyFiltering(inspectGoal: AutoCodeInspection): AutoCodeInspection {
    // TODO this typing is messy
    // tslint:disable-next-line:no-object-literal-type-assertion
    const i = new AutoCodeInspection({
            ...inspectGoal.definition,
            uniqueName: inspectGoal.uniqueName + "legacyFilter",
        } as FulfillableGoalDetails,
        ...inspectGoal.dependsOn);
    for (const r of inspectGoal.registrations) {
        i.with(legacyFilteringReviewerRegistration(r));
    }
    for (const l of inspectGoal.listeners) {
        i.withListener(l);
    }
    return i;
}

/**
 * Legacy filtering extension pack. Adds autofix to create baseline files
 * and command to remove baseline files.
 * Also be sure to wrap the inspectGoal before registration
 * with withLegacyFiltering
 * @param {WellKnownGoals} wellKnownGoals
 * @return {ExtensionPack}
 */
export function legacyFiltering(wellKnownGoals: WellKnownGoals): ExtensionPack {
    return {
        ...metadata(),
        name: "@atomist/sdm-pack-issue/legacyFiltering",
        configure: sdm => {
            if (!!wellKnownGoals.inspectGoal && !!wellKnownGoals.autofixGoal) {
                wellKnownGoals.autofixGoal.with(legacyFilteringBaselineAutofix(wellKnownGoals.inspectGoal));
                sdm.addCodeTransformCommand(clearBaselineCommand(wellKnownGoals.inspectGoal));
            }
            return sdm;
        },
    };
}

/**
 * Command to clear baseline files. Clears all unless one is specified.
 * @param {AutoCodeInspection} inspectGoal
 * @return {CodeTransformRegistration<{reviewerName?: string}>}
 */
function clearBaselineCommand(inspectGoal: AutoCodeInspection): CodeTransformRegistration<{ reviewerName?: string }> {
    return {
        name: "ClearBaseline",
        intent: "clear review baseline",
        description: "Clear the review baseline files. Clears all unless a single reviewerName is provided",
        parameters: {
            reviewerName: {
                description: "Name of single reviewer to remove. Remove all if not specified.",
                required: false,
            },
        },
        transform: async (p, i) => {
            for (const rr of inspectGoal.registrations) {
                if (!i.parameters.reviewerName || i.parameters.reviewerName === rr.name) {
                    const legacyFile = legacyFileNameFor(rr);
                    await p.deleteFile(legacyFile);
                    await i.addressChannels(`Review baseline file \`${legacyFile}\``);
                }
            }
        },
    };
}

/**
 * Run any reviewers for which there isn't a legacy autofix file, and create one for a baseline
 */
function legacyFilteringBaselineAutofix(inspectGoal: AutoCodeInspection): AutofixRegistration {
    return {
        name: "legacyFilter",
        transform: async (p, i) => {
            await Promise.all(inspectGoal.registrations.map(rr => establishBaseline(rr, p, i)));
            await i.addressChannels(`Baseline established with ${inspectGoal.registrations.length} registrations`);
        },
    };
}

/**
 * File containing legacy issues for a given reviewer.
 * We won't flag them again until their
 * locations are changed.
 * @type {string}
 */
function legacyFileNameFor(rr: ReviewerRegistration): string {
    return `.atomist/legacyIssues_${rr.name}.json`;
}

function legacyFilteringReviewerRegistration(rr: ReviewerRegistration): ReviewerRegistration {
    return {
        name: rr.name,
        pushTest: rr.pushTest,
        inspection: async (p, papi) => {
            const raw = await rr.inspection(p, papi);
            return filterOutLegacyComments(rr, raw, papi);
        },
        onInspectionResult: rr.onInspectionResult,
        parametersInstance: rr.parametersInstance,
    };
}

/**
 * Filter out legacy comments for this review
 * @param {ReviewerRegistration} rr
 * @param {ProjectReview} pr
 * @param {PushAwareParametersInvocation<any>} papi
 * @return {Promise<ProjectReview>}
 */
async function filterOutLegacyComments(rr: ReviewerRegistration,
                                       pr: ProjectReview,
                                       papi: PushAwareParametersInvocation<any>): Promise<ProjectReview> {
    if (!papi.push) {
        logger.info("Can't filter out legacy comments: Push is not available");
        return pr;
    }
    const legacyFile = await papi.push.project.getFile(legacyFileNameFor(rr));
    const legacyComments: ReviewComment[] = !!legacyFile ?
        JSON.parse(await legacyFile.getContent()) :
        [];
    return {
        repoId: pr.repoId,
        comments: pr.comments.filter(c => {
            return !legacyComments.some(lc =>
                lc.category === c.category &&
                lc.subcategory === c.subcategory &&
                lc.detail === c.detail &&
                areEqual(lc.sourceLocation, c.sourceLocation));
        }),
    };
}

function areEqual(a: SourceLocation, b: SourceLocation): boolean {
    return a === b ||
        (a.path === b.path && a.offset === b.offset);
}

/**
 * Create a baseline file for the given reviewer registration, by
 * running it against the project
 * @param {ReviewerRegistration} rr
 * @param {Project} p
 * @param {PushAwareParametersInvocation<any>} papi
 * @return {Promise<void>}
 */
async function establishBaseline(rr: ReviewerRegistration,
                                 p: Project,
                                 papi: PushAwareParametersInvocation<any>): Promise<void> {
    const legacyFile = legacyFileNameFor(rr);
    if (!await p.hasFile(legacyFile)) {
        await papi.addressChannels(`Running ${rr.name} on project at ${
            p.id.url} to establish baseline: file is \`${legacyFile}\``);
        const review: ProjectReview = await rr.inspection(p, papi);
        const json = JSON.stringify(review.comments, undefined, 2);
        await p.addFile(legacyFile, json);
    }

}

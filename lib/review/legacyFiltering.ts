import { logger, ProjectReview, RepoRef } from "@atomist/automation-client";
import {
    AutoCodeInspection,
    AutofixRegistration,
    hasFile,
    not,
    PushAwareParametersInvocation,
    ReviewerRegistration,
} from "@atomist/sdm";
import * as _ from "lodash";

/**
 * File containing legacy issues. We won't flag them again until their
 * locations are changed.
 * @type {string}
 */
const LegacyFile = ".atomist/legacyIssues.json";

function legacyFilteringReviewerRegistration(rr: ReviewerRegistration): ReviewerRegistration {
    return {
        name: rr.name,
        pushTest: rr.pushTest,
        inspection: async (p, papi) => {
            const raw = await rr.inspection(p, papi);
            return filterOutLegacyComments(raw, papi);
        },
        onInspectionResult: rr.onInspectionResult,
        parametersInstance: rr.parametersInstance,
    };
}

async function filterOutLegacyComments(pr: ProjectReview,
                                       papi: PushAwareParametersInvocation<any>): Promise<ProjectReview> {
    if (!papi.push) {
        logger.info("Can't filter out legacy comments: Push is not available");
        return pr;
    }
    const legacyFile = await papi.push.project.getFile(LegacyFile);
    const legacyIssues: ProjectReview = !!legacyFile ?
        JSON.parse(await legacyFile.getContent()) :
        { repoId: pr.repoId, comments: [] };
    return {
        repoId: pr.repoId,
        comments: pr.comments.filter(c => {
            return !legacyIssues.comments.some(lc =>
                lc.category === c.category &&
                lc.subcategory === c.subcategory &&
                JSON.stringify(lc.sourceLocation) === JSON.stringify(c.sourceLocation));
        }),
    };
}

/**
 * If there's no legacy autofix file, run all reviewers and create one for a baseline
 */
export function legacyFilteringBaselineAutofix(inspectGoal: AutoCodeInspection): AutofixRegistration {
    return {
        name: "legacyFilter",
        pushTest: not(hasFile(LegacyFile)),
        transform: async (p, i) => {
            const reviewers = inspectGoal.registrations;
            await i.addressChannels(`Running ${reviewers.length} reviewers on project at ${
                p.id.url} to establish baseline`);
            const reviews: ProjectReview[] =
                await Promise.all(reviewers.map(rr => rr.inspection(p, i)));
            const consolidated = consolidate(reviews, p.id);
            const json = JSON.stringify(consolidated);
            await p.addFile(LegacyFile, json);
        },
    };
}

/**
 * Make this goal legacy filtering.
 * @param {AutoCodeInspection} inspectGoal
 * @return {AutoCodeInspection}
 */
export function withLegacyFiltering(inspectGoal: AutoCodeInspection): AutoCodeInspection {
    const i = new AutoCodeInspection(inspectGoal.definition, ...inspectGoal.dependsOn);
    for (const r of inspectGoal.registrations) {
        i.with(legacyFilteringReviewerRegistration(r));
    }
    for (const l of inspectGoal.listeners) {
        i.withListener(l);
    }
    return i;
}

function consolidate(reviews: ProjectReview[], repoId: RepoRef): ProjectReview {
    return {
        repoId,
        comments: _.flatten(reviews.map(review => review.comments)),
    };
}

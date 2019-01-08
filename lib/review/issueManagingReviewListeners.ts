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
    deepLink,
    GitHubRepoRef,
    Issue,
    logger,
    RemoteRepoRef,
    ReviewComment,
    reviewCommentSorter,
} from "@atomist/automation-client";
import {
    OnPushToAnyBranch,
    ReviewListener,
    ReviewListenerInvocation,
    ReviewListenerRegistration,
} from "@atomist/sdm";
import * as _ from "lodash";
import {
    createComment,
    createIssue,
    findIssue,
    findIssues,
    updateIssue,
} from "./issue";
import { raiseIssueLinkEvent } from "./linkIssue";

export type BranchFilter = (push: OnPushToAnyBranch.Push) => boolean;

export type CommentFilter = (r: ReviewComment) => boolean;

/**
 * Format the body of an issue based on this comment
 */
export type CommentFormatter = (comment: ReviewComment, rr: RemoteRepoRef) => string;

/**
 * Format the body of an issue based on these comments
 */
export type CommentsFormatter = (comments: ReviewComment[], rr: RemoteRepoRef) => string;

/**
 * Manage a single issue for a subset of review problems
 * @param commentFilter filter for relevant review comments
 * @param title title of the issue to manage
 * @param bodyFormatter function to create body from comments
 * @return {Promise<void>}
 * @constructor
 */
export function singleIssueManagingReviewListener(commentFilter: CommentFilter,
                                                  title: string,
                                                  bodyFormatter: CommentsFormatter): ReviewListener {
    return async (ri: ReviewListenerInvocation) => {
        if (ri.push.branch !== ri.push.repo.defaultBranch) {
            // We only care about pushes to the default branch
            return;
        }
        const relevantComments = ri.review.comments.filter(commentFilter);
        const existingIssue = await findIssue(ri.credentials, ri.id as GitHubRepoRef, title);
        if (relevantComments.length === 0) {
            if (existingIssue) {
                logger.info("Closing issue %d because all comments have been addressed", existingIssue.number);
                const congrats =
                    `The last review problem was fixed by @${who(ri.push)} when they pushed ${linkToSha(ri.id)}`;
                await updateIssue(ri.credentials, ri.id, { ...existingIssue, state: "closed", body: congrats });
            }
            return;
        }

        // there are some comments
        if (!existingIssue) {
            const issue = {
                title,
                body: bodyFormatter(relevantComments, ri.id),
                // labels? assignees?
            };
            logger.info("Creating issue %j from review comments", issue);
            await createIssue(ri.credentials, ri.id, issue);
        } else {
            // Update the issue if necessary, reopening it if need be
            const body = bodyFormatter(relevantComments, ri.id);
            if (body !== existingIssue.body) {
                logger.info("Updating issue %d with the latest comments", existingIssue.number);
                await updateIssue(ri.credentials, ri.id,
                    {
                        ...existingIssue,
                        state: "open",
                        body,
                    });
            } else {
                logger.info("Not updating issue %d as body has not changed", existingIssue.number);
            }
        }
        // Should we catch exceptions and not fail the Goal if this doesn't work?
    };
}

/**
 * Take this subset of issues and maintain an issue for each
 * @param {CommentFilter} commentFilter
 * @param {CommentsFormatter} bodyFormatter
 * @return {ReviewListener}
 */
export function multiIssueManagingReviewListener(commentFilter: CommentFilter,
                                                 bodyFormatter: CommentFormatter): ReviewListener {
    return async (ri: ReviewListenerInvocation) => {
        if (ri.push.branch !== ri.push.repo.defaultBranch) {
            // We only care about pushes to the default branch
            return;
        }
        const relevantComments = ri.review.comments.filter(commentFilter);
        for (const comment of relevantComments) {
            // TODO disambiguate
            const title = comment.detail;
            const existingIssue = await findIssue(ri.credentials, ri.id as GitHubRepoRef, title);

            // there are some comments
            if (!existingIssue) {
                const issue = {
                    title,
                    body: bodyFormatter(comment, ri.id),
                    // labels? assignees?
                };
                logger.info("Creating issue %j from review comment", issue);
                await createIssue(ri.credentials, ri.id, issue);
            } else {
                // Update the issue if necessary, reopening it if need be
                const body = bodyFormatter(comment, ri.id);
                if (body !== existingIssue.body) {
                    logger.info("Updating issue %d with the latest ", existingIssue.number);
                    await updateIssue(ri.credentials, ri.id,
                        {
                            ...existingIssue,
                            state: "open",
                            body,
                        });
                } else {
                    logger.info("Not updating issue %d as body has not changed", existingIssue.number);
                }
            }
            // Should we catch exceptions and not fail the Goal if this doesn't work?
        }
    };
}

/**
 * Take this subset of issues and maintain an issue for each category
 * @param {CommentFilter} commentFilter
 * @param {CommentsFormatter} bodyFormatter
 * @return {ReviewListener}
 */
export function singleIssuePerCategoryManagingReviewListener(
    source: string,
    assignIssue: boolean = false,
    branchFilter: BranchFilter = push => push.branch === push.repo.defaultBranch,
    commentFilter: CommentFilter = () => true,
    bodyFormatter: CommentsFormatter = SubCategorySortingBodyFormatter): ReviewListener {
    return async (ri: ReviewListenerInvocation) => {

        const relevantCategories = _.groupBy(ri.review.comments.filter(commentFilter), "category");
        const tag = createTag(source, ri.push.branch);
        let knownIssues = await findIssues(ri.credentials, ri.id as GitHubRepoRef, tag);

        for (const category in relevantCategories) {
            if (relevantCategories.hasOwnProperty(category)) {

                const relevantComments = relevantCategories[category];
                const title = `Code Inspection: ${category} on ${ri.push.branch}`;
                const existingIssue = await findIssue(ri.credentials, ri.id as GitHubRepoRef, title);

                knownIssues = knownIssues.filter(i => i.title !== title);

                const isBug = relevantComments.some(c => c.severity === "error");
                const isEnhancement = relevantComments.some(c => c.severity === "warn");
                const labels = isBug ? ["bug"] : (isEnhancement ? ["enhancement"] : []);

                // there are some comments
                if (!existingIssue) {
                    const issue: Issue = {
                        title,
                        body: `${bodyFormatter(relevantComments, ri.id)}\n\n${tag}`,
                        assignees: assignIssue ? _.uniq(ri.push.commits.map(c => c.author.login)) : undefined,
                        labels,
                    };
                    logger.info("Creating issue %j from review comment", issue);
                    const newIssue = await createIssue(ri.credentials, ri.id, issue);
                    await raiseIssueLinkEvent(newIssue, ri);
                } else {
                    // Update the issue if necessary, reopening it if need be
                    const body = `${bodyFormatter(relevantComments, ri.id)}\n\n${tag}`;
                    if (body !== existingIssue.body) {
                        logger.info("Updating issue %d with the latest ", existingIssue.number);
                        await updateIssue(ri.credentials, ri.id,
                            {
                                ...existingIssue,
                                state: "open",
                                body,
                                assignees: assignIssue ? _.uniq(ri.push.commits.map(c => c.author.login)) : undefined,
                                labels,
                            });
                        await raiseIssueLinkEvent(existingIssue, ri);
                    } else {
                        logger.info("Not updating issue %d as body has not changed", existingIssue.number);
                    }
                }
            }
        }

        // Close the remaining issues
        if (knownIssues.length > 0) {
            const body =
                `Issue closed because last code inspection problem was fixed by @${who(ri.push)} when they pushed ${linkToSha(ri.id)}.`;
            for (const existingIssue of knownIssues) {
                await createComment(ri.credentials, ri.id, existingIssue, body);
                await updateIssue(ri.credentials, ri.id,
                    {
                        ...existingIssue,
                        state: "closed",
                    });
                await raiseIssueLinkEvent(existingIssue, ri);
            }
        }

    };
}

export function createTag(tag: string, branch: string): string {
    return `[atomist:code-inspection:${branch.toLowerCase()}=${tag.toLowerCase()}]`;
}

function who(push: OnPushToAnyBranch.Push): string {
    const screenName: string = _.get(push, "after.committer.login");
    if (screenName) {
        return screenName;
    }
    return _.get(push, "after.committer.person.chatId.screenName", "someone");
}

function linkToSha(id: RemoteRepoRef): string {
    return `[${id.sha.substr(0, 7)}](${id.url + "/tree/" + id.sha})`;
}

/**
 * Format review comment into a Markdown list item including trailing
 * newline.
 *
 * @param c review comment to format
 * @return Markdown as string with trailing newline
 */
export function reviewCommentToMarkdown(c: ReviewComment, grr?: GitHubRepoRef): string {
    let loc: string = "";
    if (c.sourceLocation && c.sourceLocation.path) {
        const line = (c.sourceLocation.lineFrom1) ? `:${c.sourceLocation.lineFrom1}` : "";
        loc = "`" + c.sourceLocation.path + line + "`";
        if (grr) {
            const url = deepLink(grr, c.sourceLocation);
            loc = `[${loc}](${url})`;
        }
        loc += ": ";
    }
    return `- ${loc}_(${c.severity})_ ${c.detail}\n`;
}

/**
 * Truncate issue body if it exceeds the maximum desired size.  The
 * maximum desired size is slightly lower than the maximum allowed by
 * GitHub to allow the issue creator to add tag markers to the issue
 * without exceeding the GitHub limit.
 *
 * @param body original message
 * @return body, truncated if necessary
 */
export function truncateBodyIfTooLarge(body: string): string {
    const bodySizeLimit = 65536 - 1000; // allow for user to add tags
    if (body.length < bodySizeLimit) {
        return body;
    }
    return body.substring(0, bodySizeLimit).replace(/\n.*$/, "\n_Issue body truncated…_\n");
}

export const CategorySortingBodyFormatter: CommentsFormatter = (comments, rr) => {
    const grr = rr as GitHubRepoRef;
    let body = "";

    const uniqueCategories = _.uniq(comments.map(c => c.category)).sort((a, b) => a.localeCompare(b));
    uniqueCategories.forEach(category => {
        body += `## ${category}\n\n`;
        body += SubCategorySortingBodyFormatter(comments.filter(c => c.category === category), grr);
    });
    return body;
};

export const SubCategorySortingBodyFormatter: CommentsFormatter = (comments, rr) => {
    const grr = rr as GitHubRepoRef;
    let body = "";

    const uniqueCategories = _.uniq(comments.map(c => c.subcategory || "n/a")).sort((a, b) => a.localeCompare(b));
    uniqueCategories.forEach(subcategory => {
        body += `### ${subcategory}\n\n`;
        body += comments
            .filter(c => c.subcategory === subcategory)
            .sort(reviewCommentSorter)
            .map(c => reviewCommentToMarkdown(c, grr))
            .join("") + "\n";
    });
    return body;
};

export function singleIssuePerCategoryManaging(
    source: string,
    assign: boolean = true,
    branchFilter: BranchFilter = p => p.repo.defaultBranch === p.branch): ReviewListenerRegistration {
    return {
        name: "GitHub Issue Review Listener",
        listener: singleIssuePerCategoryManagingReviewListener(source, assign, branchFilter),
    };
}

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
    ProjectOperationCredentials,
    RemoteRepoRef,
    ReviewComment,
    TokenCredentials,
} from "@atomist/automation-client";
import {
    OnPushToAnyBranch,
    ReviewListener,
    ReviewListenerInvocation,
    ReviewListenerRegistration,
} from "@atomist/sdm";
import { github } from "@atomist/sdm-core";
import * as slack from "@atomist/slack-messages";
import axios from "axios";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import Push = OnPushToAnyBranch.Push;

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
                    `The last review problem was fixed by ${who(ri.push)} when they pushed ${linkToSha(ri.id)}`;
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
    commentFilter: CommentFilter = () => true,
    bodyFormatter: CommentsFormatter = SubCategorySortingBodyFormatter): ReviewListener {
    return async (ri: ReviewListenerInvocation) => {
        if (ri.push.branch !== ri.push.repo.defaultBranch) {
            // We only care about pushes to the default branch
            return;
        }
        const relevantCategories = _.groupBy(ri.review.comments.filter(commentFilter), "category");
        const tag = createTag(source);
        let knownIssues = await findIssues(ri.credentials, ri.id as GitHubRepoRef, tag);

        for (const category in relevantCategories) {
            if (relevantCategories.hasOwnProperty(category)) {

                const relevantComments = relevantCategories[category];
                const title = `Code Inspection: ${category}`;
                const existingIssue = await findIssue(ri.credentials, ri.id as GitHubRepoRef, title);

                knownIssues = knownIssues.filter(i => i.title !== title);

                // there are some comments
                if (!existingIssue) {
                    const issue = {
                        title,
                        body: `${bodyFormatter(relevantComments, ri.id)}\n\n${tag}`,
                        // labels? assignees?
                    };
                    logger.info("Creating issue %j from review comment", issue);
                    await createIssue(ri.credentials, ri.id, issue);
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
                            });
                    } else {
                        logger.info("Not updating issue %d as body has not changed", existingIssue.number);
                    }
                }
            }
        }

        // Close the remaining issues
        if (knownIssues.length > 0) {
            for (const existingIssue of knownIssues) {
                await updateIssue(ri.credentials, ri.id,
                    {
                        ...existingIssue,
                        state: "closed",
                    });
            }
        }

    };
}

function createTag(tag: string): string {
    return `[atomist:code-inspection=${tag.toLowerCase()}]`;
}

function who(push: Push): string {
    const screenName: string = _.get(push, "after.committer.person.chatId.screenName");
    if (screenName) {
        return slack.user(screenName);
    }
    return _.get(push, "after.committer.token", "someone");
}

function linkToSha(id: RemoteRepoRef): string {
    return slack.url(id.url + "/tree/" + id.sha, id.sha.substr(0, 7));
}

interface KnownIssue extends Issue {
    state: "open" | "closed";
    number: number;
    url: string;
}

// update the state and body of an issue.
async function updateIssue(credentials: ProjectOperationCredentials,
                           rr: RemoteRepoRef,
                           issue: KnownIssue): Promise<void> {
    const safeIssue = {
        state: issue.state,
        body: issue.body,
    };
    const token = (credentials as TokenCredentials).token;
    const grr = rr as GitHubRepoRef;
    const url = encodeURI(`${grr.scheme}${grr.apiBase}/repos/${rr.owner}/${rr.repo}/issues/${issue.number}`);
    logger.info(`Request to '${url}' to update issue`);
    await axios.patch(url, safeIssue, github.authHeaders(token)).catch(err => {
        logger.error("Failure updating issue. response: %s", stringify(err.response.data));
        throw err;
    });
}

async function createIssue(credentials: ProjectOperationCredentials,
                           rr: RemoteRepoRef,
                           issue: Issue): Promise<void> {
    const token = (credentials as TokenCredentials).token;
    const grr = rr as GitHubRepoRef;
    const url = `${grr.scheme}${grr.apiBase}/repos/${rr.owner}/${rr.repo}/issues`;
    logger.info(`Request to '${url}' to create issue`);
    await axios.post(url, issue, github.authHeaders(token));
}

// find the most recent open (or closed, if none are open) issue with precisely this title
async function findIssue(credentials: ProjectOperationCredentials,
                         rr: RemoteRepoRef,
                         title: string): Promise<KnownIssue> {
    const token = (credentials as TokenCredentials).token;
    const grr = rr as GitHubRepoRef;
    const url = encodeURI(
        `${grr.scheme}${grr.apiBase}/search/issues?q=is:issue+user:${rr.owner}+repo:${rr.repo}+"${title}"`);
    logger.info(`Request to '${url}' to get issues`);
    const returnedIssues: KnownIssue[] = await axios.get(url, github.authHeaders(token)).then(r => r.data.items);
    return returnedIssues.filter(i =>
        i.title === title
        && i.url.includes(`/${rr.owner}/${rr.repo}/issues/`))
        .sort(openFirst)[0];
}

async function findIssues(credentials: ProjectOperationCredentials,
                          rr: RemoteRepoRef,
                          body: string): Promise<KnownIssue[]> {
    const token = (credentials as TokenCredentials).token;
    const grr = rr as GitHubRepoRef;
    const url = encodeURI(
        `${grr.scheme}${grr.apiBase}/search/issues?q=is:issue+user:${rr.owner}+repo:${rr.repo}+"${body}"`);
    logger.info(`Request to '${url}' to get issues`);
    const returnedIssues: KnownIssue[] = await axios.get(url, github.authHeaders(token)).then(r => r.data.items);
    return returnedIssues.filter(i =>
        i.body.includes(body)
        && i.url.includes(`/${rr.owner}/${rr.repo}/issues/`));
}

/**
 * Compare giving open issues a lower sort order
 * @param {KnownIssue} a
 * @param {KnownIssue} b
 * @return {number}
 */
function openFirst(a: KnownIssue, b: KnownIssue): number {
    if (a.state === "open" && b.state === "closed") {
        return -1;
    }
    if (b.state === "open" && a.state === "closed") {
        return 1;
    }
    return b.number - a.number; // if same state, most recent one first.
}

export const CategorySortingBodyFormatter: CommentsFormatter = (comments, rr) => {
    const grr = rr as GitHubRepoRef;
    let body = "";

    const uniqueCategories = _.uniq(comments.map(c => c.category)).sort();
    uniqueCategories.forEach(category => {
        body += `## ${category}\n`;
        body += comments
            .filter(c => c.category === category)
            .map(c =>
                `- \`${c.sourceLocation.path || ""}${c.sourceLocation.lineFrom1 ? `:${c.sourceLocation.lineFrom1}` : ""
                    }\`: [${c.detail}](${deepLink(grr, c.sourceLocation)})\n`).join("\n");
    });
    return body;
};

export const SubCategorySortingBodyFormatter: CommentsFormatter = (comments, rr) => {
    const grr = rr as GitHubRepoRef;
    let body = "";

    const uniqueCategories = _.uniq(comments.map(c => c.subcategory || "n/a")).sort();
    uniqueCategories.forEach(category => {
        body += `## ${category}\n`;
        body += comments
            .filter(c => c.subcategory === category)
            .map(c =>
                `- \`${c.sourceLocation.path || ""}${c.sourceLocation.lineFrom1 ? `:${c.sourceLocation.lineFrom1}` : ""
                    }\`: [${c.detail}](${deepLink(grr, c.sourceLocation)})\n`).join("\n");
    });
    return body;
};

export function singleIssuePerCategoryManaging(source: string): ReviewListenerRegistration {
    return {
        name: "GitHub Issue Review Listener",
        listener: singleIssuePerCategoryManagingReviewListener(source),
    };
}

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
    GitHubRepoRef,
    Issue,
    logger,
    ProjectOperationCredentials,
    RemoteRepoRef,
    TokenCredentials,
} from "@atomist/automation-client";
import { github } from "@atomist/sdm-core";
import axios from "axios";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";

export interface KnownIssue extends Issue {
    state: "open" | "closed";
    number: number;
    url: string;
}

/**
 * Update the state and body of an issue.
 */
export async function updateIssue(credentials: ProjectOperationCredentials, rr: RemoteRepoRef, issue: KnownIssue): Promise<KnownIssue> {
    const safeIssue = {
        state: issue.state,
        body: issue.body,
    };
    const token = (credentials as TokenCredentials).token;
    const grr = rr as GitHubRepoRef;
    const url = encodeURI(`${grr.scheme}${grr.apiBase}/repos/${rr.owner}/${rr.repo}/issues/${issue.number}`);
    logger.info(`Request to '${url}' to update issue`);
    try {
        const resp = await axios.patch(url, safeIssue, github.authHeaders(token));
        return resp.data;
    } catch (e) {
        e.message = `Failed to update issue ${issue.number}: ${e.message}: ${stringify(e.response.data)}`;
        logger.error(e.message);
        throw e;
    }
}

/**
 * Create a GitHub issue and return the API response.
 */
export async function createIssue(credentials: ProjectOperationCredentials, rr: RemoteRepoRef, issue: Issue): Promise<KnownIssue> {
    const token = (credentials as TokenCredentials).token;
    const grr = rr as GitHubRepoRef;
    const url = `${grr.scheme}${grr.apiBase}/repos/${rr.owner}/${rr.repo}/issues`;
    logger.info(`Request to '${url}' to create issue`);
    try {
        const resp = await axios.post(url, issue, github.authHeaders(token));
        return resp.data;
    } catch (e) {
        e.message = `Failed to create issue: ${e.message}: ${stringify(e.response.data)}`;
        logger.error(e.message);
        throw e;
    }
}

function searchIssueRepoUrl(rr: GitHubRepoRef, tail?: string): string {
    const raw = `${rr.scheme}${rr.apiBase}/search/issues?q=is:issue+repo:${rr.owner}/${rr.repo}` +
        (tail ? tail : "");
    return encodeURI(raw);
}

/**
 * Find the most recent open (or closed, if none are open) issue with precisely this title
 */
export async function findIssue(credentials: ProjectOperationCredentials, rr: RemoteRepoRef, title: string): Promise<KnownIssue> {
    const token = (credentials as TokenCredentials).token;
    const grr = rr as GitHubRepoRef;
    const url = searchIssueRepoUrl(grr, `+"${title}"`);
    logger.info(`Request to '${url}' to get issues`);
    try {
        const resp = await axios.get(url, github.authHeaders(token));
        const returnedIssues: KnownIssue[] = resp.data.items;
        const filteredIssues = returnedIssues.filter(i => i.title === title && i.url.includes(`/${rr.owner}/${rr.repo}/issues/`));
        if (filteredIssues.length < 1) {
            return undefined;
        }
        return filteredIssues.sort(openFirst)[0];
    } catch (e) {
        e.message = `Failed to find issue: ${e.message}: ${stringify(e.response.data)}`;
        logger.error(e.message);
        throw e;
    }
}

/**
 * Find all repos in the provided repository whose body contains the
 * text `body`.  Open and closed issues are returned.
 */
export async function findIssues(credentials: ProjectOperationCredentials, rr: RemoteRepoRef, body: string): Promise<KnownIssue[]> {
    const token = (credentials as TokenCredentials).token;
    const grr = rr as GitHubRepoRef;
    const url = searchIssueRepoUrl(grr, `+"${body}"`);
    logger.info(`Request to '${url}' to get issues`);
    try {
        const resp = await axios.get(url, github.authHeaders(token));
        const returnedIssues: KnownIssue[] = resp.data.items;
        return returnedIssues.filter(i => i.body.includes(body) && i.url.includes(`/${rr.owner}/${rr.repo}/issues/`));
    } catch (e) {
        e.message = `Failed to find issues: ${e.message}: ${stringify(e.response.data)}`;
        logger.error(e.message);
        throw e;
    }
}

/**
 * Function suitable for use in Array.prototype.sort() to sort an
 * array of issues, giving open issues a lower sort order.  If both
 * issues have the same state, give more recent, i.e., higher number,
 * issues a lower sort order.
 *
 * @param a first issue to compare
 * @param b second issue to compare
 * @return -1 if `a` comes first, 1 if `b`, 0 if equal.
 */
function openFirst(a: KnownIssue, b: KnownIssue): number {
    if (a.state === "open" && b.state === "closed") {
        return -1;
    }
    if (b.state === "open" && a.state === "closed") {
        return 1;
    }
    return b.number - a.number;
}
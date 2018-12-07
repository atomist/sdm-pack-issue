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
    GraphQL,
    OnEvent,
    Success,
    TokenCredentials,
} from "@atomist/automation-client";
import {
    CredentialsResolver,
    EventHandlerRegistration,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { codeLine } from "@atomist/slack-messages";
import * as _ from "lodash";
import {
    createComment,
    findIssue,
    updateIssue,
} from "../review/issue";
import { createTag } from "../review/issueManagingReviewListeners";
import { OnBranchDeletion } from "../typings/types";

function closeCodeInspectionIssuesListener(sdm: SoftwareDeliveryMachine,
                                           ...sources: string[]): OnEvent<OnBranchDeletion.Subscription, CredentialsResolver> {
    return async (e, ctx, params) => {
        const branch = e.data.DeletedBranch[0].name;
        const repo = e.data.DeletedBranch[0].repo;
        const id = GitHubRepoRef.from({
            owner: repo.owner,
            repo: repo.name,
            rawApiBase: repo.org.provider.apiUrl,
        });
        const credentialsResolver = _.merge(sdm.configuration.sdm.credentialsResolver, params);
        const credentials: TokenCredentials =
            (credentialsResolver.eventHandlerCredentials(ctx, id) as TokenCredentials);
        for (const source of sources) {
            const tag = createTag(source, branch);
            const issue = await findIssue(credentials, id, tag, i => i.body.includes(tag));
            if (issue && issue.state === "open") {
                issue.state = "closed";
                await createComment(credentials, id, issue, `Issue closed because branch ${codeLine(branch)} was deleted`);
                await updateIssue(credentials, id, issue);
            }
        }
        return Success;
    };
}

/**
 * Close code inspection issues when the underlying branch gets deleted
 * @param sdm
 * @param sources
 */
export function closeCodeInspectionIssues(sdm: SoftwareDeliveryMachine,
                                          ...sources: string[]): EventHandlerRegistration<OnBranchDeletion.Subscription, CredentialsResolver> {
    return {
        name: "CloseCodeInspectionIssues",
        subscription: GraphQL.subscription("OnBranchDeletion"),
        description: "Closes code inspection issues on branch deletion",
        tags: ["github", "issues", "code inspection"],
        listener: closeCodeInspectionIssuesListener(sdm, ...sources),
        paramsMaker: () => sdm.configuration.sdm.credentialsResolver,
    };
}

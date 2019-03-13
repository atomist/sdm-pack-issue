/*
 * Copyright © 2019 Atomist, Inc.
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
    EventFired,
    GitHubRepoRef,
    GraphQL,
    HandlerContext,
    HandlerResult,
    logger,
    OnEvent,
    QueryNoCacheOptions,
    SuccessPromise,
    TokenCredentials,
} from "@atomist/automation-client";
import {
    CredentialsResolver,
    EventHandlerRegistration,
    SoftwareDeliveryMachine,
    resolveCredentialsPromise,
} from "@atomist/sdm";
import { updateIssue } from "@atomist/sdm-core/lib/util/github/ghub";
import * as _ from "lodash";
import * as github from "../support/gitHubApi";
import * as schema from "../typings/types";

/**
 * Handle issue labeling based on the Deployment events
 * @param sdm
 */
function labelIssuesOnDeploymentListener(sdm: SoftwareDeliveryMachine):
    OnEvent<schema.LabelIssuesOnDeployment.Subscription, CredentialsResolver> {
    return async (e: EventFired<schema.LabelIssuesOnDeployment.Subscription>,
                  ctx: HandlerContext,
                  params: CredentialsResolver): Promise<HandlerResult> => {
        const deployment = e.data.Deployment[0];
        let previousDeployment: schema.LabelIssuesOnDeployment.Deployment;

        // 1. find previous deployment
        const deployments = await ctx.graphClient.query<schema.DeploymentsForRepo.Query,
            schema.DeploymentsForRepo.Variables>({
            name: "DeploymentsForRepo",
            variables: {
                owner: [deployment.commit.owner],
                repo: [deployment.commit.repo],
                environment: [deployment.environment],
            },
            options: QueryNoCacheOptions,
        });

        // Do some sanity checking and make sure the first deployment is the current event
        if (deployments.Deployment && deployments.Deployment.length === 2) {
            if (deployments.Deployment[0].commit.sha === deployment.commit.sha) {
                previousDeployment = deployments.Deployment[1];
            }
        }

        if (!previousDeployment) {
            logger.debug("Couldn't obtain previous deployment");
            return SuccessPromise;
        }

        // 2. find all commits for the default branch between two deployments
        const commitQuery = retrieveCommitQuery(deployment.commit.owner, deployment.commit.repo, "master", ctx);
        const commits: string[] = [];

        let complete = false;
        let foundStart = false;
        let counter = 0;
        while (!complete) {
            const result = await commitQuery(counter);
            counter++;

            const commitChunks = _.sortBy(_.flatten(result.Push.map(p => p.commits)), "timestamp")
                .reverse().map(c => c.sha);

            let sIx = commitChunks.findIndex(c => c === deployment.commit.sha);
            const eIx = commitChunks.findIndex(c => c === previousDeployment.commit.sha);

            if (sIx >= 0) {
                foundStart = true;
            }

            if (sIx < 0 && foundStart) {
                sIx = 0;
            }

            if (sIx >= 0) {
                if (eIx >= 0) {
                    commits.push(...commitChunks.slice(sIx, eIx));
                } else {
                    commits.push(...commitChunks.slice(sIx));
                }
            }

            if (commitChunks.length === 0 || eIx >= 0) {
                complete = true;
            }
        }
        logger.debug("Previous deployment retrieved and found the following commits between both deployments: '%s'",
            commits.join(", "));

        // 3. find all issue relationships for commits
        const issues = await ctx.graphClient.query<schema.CommitIssueRelationshipByCommit.Query,
            schema.CommitIssueRelationshipByCommit.Variables>({
            name: "CommitIssueRelationshipByCommit",
            variables: {
                owner: [deployment.commit.owner],
                repo: [deployment.commit.repo],
                sha: commits,
            },
        });

        // 4. update labels for found issues
        if (issues.CommitIssueRelationship && issues.CommitIssueRelationship.length > 0) {
            const id = GitHubRepoRef.from({
                owner: deployment.commit.owner,
                repo: deployment.commit.repo,
            });

            const credentialsResolver = _.merge(sdm.configuration.sdm.credentialsResolver, params);
            const credentials: TokenCredentials =  await resolveCredentialsPromise(
                credentialsResolver.eventHandlerCredentials(ctx, id)) as TokenCredentials;
            const api = github.api(credentials.token);
            const label = `env:${deployment.environment}`;
            await github.createLabel(deployment.commit.owner, deployment.commit.repo, label, api);

            for (const issue of issues.CommitIssueRelationship) {

                // read existing issue details
                const issueData = await retrieveIssue(
                    deployment.commit.owner,
                    deployment.commit.repo,
                    issue.issue.name,
                    ctx);

                if (issueData) {
                    // update issue
                    await updateIssue(
                        credentials,
                        id,
                        +issue.issue.name,
                        {
                            title: issueData.title,
                            body: issueData.body,
                            labels: [...(issueData.labels || []).map(l => l.name), label],
                        });
                }
            }
        }

        return SuccessPromise;
    };
}

/**
 * Query to page through commits of a given repository
 * @param owner
 * @param repo
 * @param branch
 * @param ctx
 */
function retrieveCommitQuery(owner: string,
                             repo: string,
                             branch: string = "master",
                             ctx: HandlerContext):
    (page: number, size?: number) => Promise<schema.CommitsForRepoAndBranch.Query> {

    return async (page: number = 0, size: number = 20) => {
        return ctx.graphClient.query<schema.CommitsForRepoAndBranch.Query,
            schema.CommitsForRepoAndBranch.Variables>({
            name: "CommitsForRepoAndBranch",
            variables: {
                owner,
                repo,
                branch,
                page: size,
                offset: page * size,
            },
        });
    };
}

/**
 * Read issue details from GraphQL
 * @param owner
 * @param repo
 * @param issue
 * @param ctx
 */
async function retrieveIssue(owner: string,
                             repo: string,
                             issue: string,
                             ctx: HandlerContext): Promise<schema.Issue.Issue | undefined> {
    const result = await ctx.graphClient.query<schema.Issue.Query, schema.Issue.Variables>({
        name: "Issue",
        variables: {
            orgOwner: owner,
            repoName: repo,
            issueName: issue,
        },
        options: QueryNoCacheOptions,
    });
    return _.get(result, "Org[0].repo[0].issue[0]");
}

/**
 * EventHandlerRegistration to listen to Deployment events and label issues with environments
 * @param sdm
 */
export function labelIssuesOnDeployment(sdm: SoftwareDeliveryMachine):
    EventHandlerRegistration<schema.LabelIssuesOnDeployment.Subscription, CredentialsResolver> {
    return {
        name: "LabelIssuesOnDeployment",
        description: "Label issues with environment when deployments are recorded",
        tags: ["github", "issue", "deployment"],
        subscription: GraphQL.subscription("LabelIssuesOnDeployment"),
        listener: labelIssuesOnDeploymentListener(sdm),
        paramsMaker: () => sdm.configuration.sdm.credentialsResolver,
    };
}

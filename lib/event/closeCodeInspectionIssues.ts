import {
    GitHubRepoRef,
    GraphQL,
    OnEvent,
    Success,
} from "@atomist/automation-client";
import {
    CredentialsResolver,
    EventHandlerRegistration,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { codeLine } from "@atomist/slack-messages";
import {
    createComment,
    findIssue,
    updateIssue,
} from "../review/issue";
import { createTag } from "../review/issueManagingReviewListeners";
import { OnBranchDeletion } from "../typings/types";

function closeCodeInspectionIssuesListener(...sources: string[]): OnEvent<OnBranchDeletion.Subscription, CredentialsResolver> {
    return async (e, ctx, params) => {
        const branch = e.data.DeletedBranch[0].name;
        const repo = e.data.DeletedBranch[0].repo;
        const id = GitHubRepoRef.from({
            owner: repo.owner,
            repo: repo.name,
            rawApiBase: repo.org.provider.apiUrl,
        });
        const credentials = params.eventHandlerCredentials(ctx, id);
        for (const source of sources) {
            const tag = createTag(source, branch);
            const issue = await findIssue(credentials, id, tag);
            if (issue.state === "open") {
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
        subscription: GraphQL.subscription("OnDeletedBranch"),
        description: "Closes code inspection issues on branch deletion",
        tags: ["github", "issues", "code inspection"],
        listener: closeCodeInspectionIssuesListener(...sources),
        paramsMaker: () => sdm.configuration.sdm.credentialsResolver,
    };
}

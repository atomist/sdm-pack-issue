import { addressEvent } from "@atomist/automation-client";
import { ReviewListenerInvocation } from "@atomist/sdm";
import { KnownIssue } from "./issue";

/**
 * Raise a CommitIssueRelationship event
 * @param issue
 * @param ri
 */
export async function raiseIssueLinkEvent(issue: KnownIssue, ri: ReviewListenerInvocation): Promise<void> {

    const payload = {
        type: "references",
        commit: {
            sha: ri.push.after.sha,
            owner: ri.push.repo.owner,
            repo: ri.push.repo.name,
        },
        issue: {
            name: issue.number.toString(),
            owner: ri.push.repo.owner,
            repo: ri.push.repo.name,
        },
    };

    await ri.context.messageClient.send(payload, addressEvent("CommitIssueRelationship"));

}

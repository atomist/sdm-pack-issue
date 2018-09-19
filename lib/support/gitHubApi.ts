/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as GitHubApi from "@octokit/rest";
import * as URL from "url";

export const DefaultGitHubApiUrl = "https://api.github.com/";

export function api(token: string, apiUrl: string = DefaultGitHubApiUrl): GitHubApi {
    // separate the url
    const url = URL.parse(apiUrl);

    const gitHubApi = new GitHubApi({
        host: url.hostname,
        // latest @octokit/rest can't deal with a single / as context; it will create invalid urls with //
        pathPrefix: url.pathname !== "/" ? url.pathname : undefined,
        protocol: url.protocol.slice(0, -1),
        port: +url.port,
    });

    gitHubApi.authenticate({ type: "token", token });
    return gitHubApi;
}

export function createLabel(owner: string, repo: string, label: string, gitHubApi: GitHubApi): Promise<void> {
    // Verify that label exists
    return gitHubApi.issues.getLabel({
        name: label,
        repo,
        owner,
    })
    // Label doesn't exist; create it
    .catch(() => {
        return gitHubApi.issues.createLabel({
            owner,
            repo,
            name: label,
            color: "307d13",
        });
    })
    .then(() => undefined);
}

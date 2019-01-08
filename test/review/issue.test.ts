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
    GitHubRepoRef,
    Issue,
    TokenCredentials,
} from "@atomist/automation-client";
import { github } from "@atomist/sdm-core";
import axios from "axios";
import * as assert from "power-assert";
import {
    createIssue,
    findIssue,
    findIssues,
    updateIssue,
} from "../../lib/review/issue";

describe("issue", () => {

    let creds: TokenCredentials;
    before(function(): void {
        if (process.env.GITHUB_TOKEN) {
            creds = { token: process.env.GITHUB_TOKEN };
        } else {
            /* tslint:disable:no-invalid-this */
            this.skip();
            /* tslint:enable:no-invalid-this */
        }
    });

    it.skip("should create, update, find, and close an issue", async () => {
        function randomInt(): number {
            return Math.floor(Math.random() * 1000000000);
        }
        function sleep(ms: number): Promise<void> {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        const rr = GitHubRepoRef.from({ owner: "atomisthqa", repo: "handlers" });
        const title = "Issue from sdm-pack-issue test " + randomInt();
        const c: Issue = { title, body: "First body\n" };
        const i = await createIssue(creds, rr, c);
        assert(i);
        assert(i.title === title);
        assert(i.body === c.body);
        assert(i.state === "open");
        const body = "Second body\n" + randomInt();
        const u = await updateIssue(creds, rr, { ...i, body });
        assert(u);
        assert(u.title === title);
        assert(u.body === body);
        assert(u.state === "open");
        await sleep(5000);
        const f = await findIssue(creds, rr, title);
        assert(f);
        assert(f.title === title);
        assert(f.body === body);
        assert(f.state === "open");
        const fs = await findIssues(creds, rr, body);
        assert(fs);
        assert(fs.length === 1);
        assert(fs[0].title === title);
        assert(fs[0].body === body);
        assert(fs[0].state === "open");
        const url = encodeURI(`${rr.scheme}${rr.apiBase}/repos/${rr.owner}/${rr.repo}/issues/${i.number}`);
        const closeIssue = { number: u.number, owner: rr.owner, repo: rr.repo, state: "closed" };
        await axios.patch(url, closeIssue, github.authHeaders(creds.token));
    }).timeout(10000);
});

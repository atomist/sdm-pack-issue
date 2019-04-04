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
    ReviewComment,
} from "@atomist/automation-client";
import * as assert from "power-assert";
import {
    CategorySortingBodyFormatter,
    reviewCommentToMarkdown,
    SubCategorySortingBodyFormatter,
} from "../../lib/review/issueManagingReviewListeners";

/* tslint:disable:max-line-length */

describe("issueManagingReviewListeners", () => {

    describe("reviewCommentToMarkdown", () => {

        it("should convert a simple comment to a Markdown item", () => {
            const c: ReviewComment = {
                detail: "Stan Lee",
                severity: "info",
            } as any;
            const m = reviewCommentToMarkdown(c);
            const e = "- _(info)_ Stan Lee\n";
            assert(m === e);
        });

        it("should convert a comment with sourceLocation", () => {
            const c: ReviewComment = {
                detail: "Stan Lee",
                severity: "warn",
                sourceLocation: {
                    path: "ant-man.ts",
                    lineFrom1: 1962,
                },
            } as any;
            const m = reviewCommentToMarkdown(c);
            const e = "- `ant-man.ts:1962`: _(warn)_ Stan Lee\n";
            assert(m === e);
        });

        it("should convert a comment with sourceLocation and GitHubRepoRef", () => {
            const c: ReviewComment = {
                detail: "Stan Lee",
                severity: "error",
                sourceLocation: {
                    path: "ant-man.ts",
                    lineFrom1: 1962,
                },
            } as any;
            const grr = GitHubRepoRef.from({ owner: "marvel", repo: "avengers", sha: "73179012fe41cb3bc09681a9fd9449ca09bcba53" });
            const m = reviewCommentToMarkdown(c, grr);
            const e = "- [`ant-man.ts:1962`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/ant-man.ts#L1962): _(error)_ Stan Lee\n";
            assert(m === e);
        });

        it("should convert a comment without a line number", () => {
            const c: ReviewComment = {
                detail: "Stan Lee",
                severity: "info",
                sourceLocation: {
                    path: "ant-man.ts",
                },
            } as any;
            const grr = GitHubRepoRef.from({ owner: "marvel", repo: "avengers", sha: "73179012fe41cb3bc09681a9fd9449ca09bcba53" });
            const m = reviewCommentToMarkdown(c, grr);
            const e = "- [`ant-man.ts`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/ant-man.ts): _(info)_ Stan Lee\n";
            assert(m === e);
        });

    });

    describe("(Sub)?CategorySortingBodyFormatter", () => {

        it("should format nothing", () => {
            const comments: ReviewComment[] = [];
            const grr = GitHubRepoRef.from({ owner: "marvel", repo: "avengers", sha: "73179012fe41cb3bc09681a9fd9449ca09bcba53" });
            const b = SubCategorySortingBodyFormatter(comments, grr);
            assert(b === "");
        });

        it("should format comments by category and subcategory", () => {
            const comments: ReviewComment[] = [
                {
                    category: "hero",
                    subcategory: "avenger",
                    detail: "Stan Lee",
                    severity: "warn",
                    sourceLocation: {
                        path: "ant-man.ts",
                        lineFrom1: 123,
                        offset: 123,
                    },
                },
                {
                    category: "hero",
                    subcategory: "x-men",
                    detail: "Jack Kirby",
                    severity: "warn",
                    sourceLocation: {
                        path: "colossus.ts",
                        lineFrom1: 123,
                        offset: 123,
                    },
                },
                {
                    category: "villian",
                    subcategory: "masters-of-evil",
                    detail: "Jack Kirby",
                    severity: "error",
                    sourceLocation: {
                        path: "baron-zemo.ts",
                        lineFrom1: 45,
                        offset: 45,
                    },
                },
                {
                    category: "villian",
                    subcategory: "x-men",
                    detail: "Jack Kirby",
                    severity: "error",
                    sourceLocation: {
                        path: "sabretooth.ts",
                        lineFrom1: 13,
                        offset: 13,
                    },
                },
                {
                    category: "hero",
                    subcategory: "avenger",
                    detail: "Stan Lee",
                    severity: "warn",
                    sourceLocation: {
                        path: "ant-man.ts",
                        lineFrom1: 43,
                        offset: 43,
                    },
                },
                {
                    category: "hero",
                    subcategory: "independent",
                    detail: "Steve Ditko",
                    severity: "warn",
                    sourceLocation: {
                        path: "spider-man.ts",
                        lineFrom1: 143,
                        offset: 143,
                    },
                },
                {
                    category: "hero",
                    subcategory: "avenger",
                    detail: "Stan Lee",
                    severity: "error",
                    sourceLocation: {
                        path: "scarlet-witch.ts",
                        lineFrom1: 444,
                        offset: 444,
                    },
                },
            ];
            const grr = GitHubRepoRef.from({ owner: "marvel", repo: "avengers", sha: "73179012fe41cb3bc09681a9fd9449ca09bcba53" });
            const cb = CategorySortingBodyFormatter(comments, grr);
            const ce = `## hero

### avenger

- [\`scarlet-witch.ts:444\`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/scarlet-witch.ts#L444): _(error)_ Stan Lee
- [\`ant-man.ts:43\`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/ant-man.ts#L43): _(warn)_ Stan Lee
- [\`ant-man.ts:123\`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/ant-man.ts#L123): _(warn)_ Stan Lee

### independent

- [\`spider-man.ts:143\`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/spider-man.ts#L143): _(warn)_ Steve Ditko

### x-men

- [\`colossus.ts:123\`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/colossus.ts#L123): _(warn)_ Jack Kirby

## villian

### masters-of-evil

- [\`baron-zemo.ts:45\`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/baron-zemo.ts#L45): _(error)_ Jack Kirby

### x-men

- [\`sabretooth.ts:13\`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/sabretooth.ts#L13): _(error)_ Jack Kirby

`;
            assert(cb === ce);
            const sb = SubCategorySortingBodyFormatter(comments, grr);
            const se = `### avenger

- [\`scarlet-witch.ts:444\`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/scarlet-witch.ts#L444): _(error)_ Stan Lee
- [\`ant-man.ts:43\`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/ant-man.ts#L43): _(warn)_ Stan Lee
- [\`ant-man.ts:123\`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/ant-man.ts#L123): _(warn)_ Stan Lee

### independent

- [\`spider-man.ts:143\`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/spider-man.ts#L143): _(warn)_ Steve Ditko

### masters-of-evil

- [\`baron-zemo.ts:45\`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/baron-zemo.ts#L45): _(error)_ Jack Kirby

### x-men

- [\`sabretooth.ts:13\`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/sabretooth.ts#L13): _(error)_ Jack Kirby
- [\`colossus.ts:123\`](https://github.com/marvel/avengers/blob/73179012fe41cb3bc09681a9fd9449ca09bcba53/colossus.ts#L123): _(warn)_ Jack Kirby

`;
            assert(sb === se);
        });

    });

});

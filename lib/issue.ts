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

import { toStringArray } from "@atomist/automation-client";
import {
    ExtensionPack,
    metadata,
} from "@atomist/sdm";
import { closeCodeInspectionIssues } from "./event/closeCodeInspectionIssues";
import { labelIssuesOnDeployment } from "./event/labelIssueOnDeployment";

/**
 * @deprecated Use issueSupport(options: IssueSupportOptions) instead
 */
export const IssueSupport: ExtensionPack = {
    ...metadata(),
    configure: sdm => {
        sdm.addEvent(labelIssuesOnDeployment(sdm));
        return sdm;
    },
};

/**
 * Options to configure the issue
 */
export interface IssueSupportOptions {

    /**
     * Label issues with environment names when deployment events occur
     */
    labelIssuesOnDeployment?: boolean;

    /**
     * Close issue created by the review listener
     */
    closeCodeInspectionIssuesOnBranchDeletion?: {
        enabled: boolean;
        source: string | string[];
    };
}

const DefaultIssueSupportOptions: IssueSupportOptions = {
    labelIssuesOnDeployment: true,
    closeCodeInspectionIssuesOnBranchDeletion: {
        enabled: false,
        source: [],
    },
};

/**
 * Configure the issue extension pack
 * @param options
 */
export function issueSupport(options: IssueSupportOptions = {}): ExtensionPack {
    return {
        ...metadata(),
        configure: sdm => {

            const optsToUse: IssueSupportOptions = {
                ...DefaultIssueSupportOptions,
                ...options,
            };

            if (optsToUse.labelIssuesOnDeployment) {
                sdm.addEvent(labelIssuesOnDeployment(sdm));
            }
            if (optsToUse.closeCodeInspectionIssuesOnBranchDeletion &&
                optsToUse.closeCodeInspectionIssuesOnBranchDeletion.enabled) {
                sdm.addEvent(closeCodeInspectionIssues(sdm,
                    ...toStringArray(optsToUse.closeCodeInspectionIssuesOnBranchDeletion.source)));
            }
        },
    };
}

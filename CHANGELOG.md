# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased](https://github.com/atomist/sdm-pack-seed/compare/1.2.2...HEAD)

### Fixed

-   Issue creation failing with 422. [#31](https://github.com/atomist/sdm-pack-issue/issues/31)

## [1.2.2](https://github.com/atomist/sdm-pack-seed/compare/1.2.1...1.2.2) - 2019-04-16

### Fixed

-   Do not truncate issue tags. [#30](https://github.com/atomist/sdm-pack-issue/issues/30)

## [1.2.1](https://github.com/atomist/sdm-pack-seed/compare/1.2.0...1.2.1) - 2019-04-04

### Fixed

-   Update issue so that it opens again. [5eb6cbb](https://github.com/atomist/sdm-pack-issue/commit/5eb6cbbe62b00582e10af6818a98f8bda512a402)
-   Issues with too-large bodies still attempting to be created. [#27](https://github.com/atomist/sdm-pack-issue/issues/27)

## [1.2.0](https://github.com/atomist/sdm-pack-seed/compare/1.1.0...1.2.0) - 2019-04-02

### Added

-   Raise issue commit link event for managed issues. [cc752d9](https://github.com/atomist/sdm-pack-issue/commit/cc752d937364646c803fc6de8fa32f1bf54170b4)
-   Add code inspection label to Code Inspection Issues. [#25](https://github.com/atomist/sdm-pack-issue/issues/25)

### Changed

-   Close issue with new comment, not body rewrite. [#11](https://github.com/atomist/sdm-pack-issue/issues/11)

### Fixed

-   Issue listener sometimes fails due to reading property on undefined. [#20](https://github.com/atomist/sdm-pack-issue/issues/20)
-   SingleIssuePerCategoryManagingReviewListener always assigns, regardless of assignIssue parameter. [#22](https://github.com/atomist/sdm-pack-issue/issues/22)
-   Review listener keeps adding comments to closed review issue. [#23](https://github.com/atomist/sdm-pack-issue/issues/23)

## [1.1.0](https://github.com/atomist/sdm-pack-seed/compare/1.0.2...1.1.0) - 2018-12-10

### Added

-   Close issues when branch gets deleted. [#13](https://github.com/atomist/sdm-pack-issue/issues/13)

### Fixed

-   Improve managing of GitHub issues. [#8](https://github.com/atomist/sdm-pack-issue/issues/8)

## [1.0.2](https://github.com/atomist/sdm-pack-seed/compare/1.0.1...1.0.2) - 2018-11-09

## [1.0.1](https://github.com/atomist/sdm-pack-seed/compare/1.0.0-RC.2...1.0.1) - 2018-11-09

### Added

-   Review listener assigns issue and manages per branch. [80abf0d](https://github.com/atomist/sdm-pack-issue/commit/80abf0d0d6c493af99e8916b55d5adf898561cb2)

### Fixed

-   Fix search issue URL for org repos. [#5](https://github.com/atomist/sdm-pack-issue/issues/5)

## [1.0.0-RC.2](https://github.com/atomist/sdm-pack-seed/compare/1.0.0-RC.1...1.0.0-RC.2) - 2018-10-30

## [1.0.0-RC.1](https://github.com/atomist/sdm-pack-seed/compare/1.0.0-M.5...1.0.0-RC.1) - 2018-10-15

## [1.0.0-M.5](https://github.com/atomist/sdm-pack-seed/tree/1.0.0-M.5) - 2018-09-26

### Added

-   Empty SDM pack structure.

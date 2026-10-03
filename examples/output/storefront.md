## bus-factor-check: FAIL - 2 findings at or above error

- Configuration: examples/config.json (Example storefront)
- History: examples/storefront/history.log (saved git log, readable form); 26 commits read
- Window: 120 days up to the newest commit; 23 commits counted, 1 older, 2 by excluded authors
- Changes: 6 authors; 1,210 changed lines in 13 files and 8 folders to depth 2
- Repository: top author Lena Ortiz with 29.91% of the changed lines; 2 authors are needed to cover 50% (Lena Ortiz and Omar Haddad)
- Rules: concentration (error, folders, at least 30 changed lines); holders (warning, folders, at least 30 changed lines)
- Findings: 5 (2 error, 3 warning); fail level error

### Findings

| Level | Rule | Unit | Found | Last change |
| --- | --- | --- | --- | --- |
| **error** | concentration | folder services/billing | Lena Ortiz made 97.31% of 372 changed lines; 1 other author | 10 days before the newest commit |
| **error** | concentration | folder services/search | Omar Haddad made 100% of 272 changed lines; no other author | 20 days before the newest commit |
| warning | holders | folder services/billing | 1 author (Lena Ortiz) made 97.31% of 372 changed lines | 10 days before the newest commit |
| warning | holders | folder services/search | 1 author (Omar Haddad) made 100% of 272 changed lines | 20 days before the newest commit |
| warning | holders | folder web/account | 1 author (Ana Silva) made 60.43% of 91 changed lines | 65 days before the newest commit |

#### concentration: services/billing

- Rule: the top author made at least 80% of the changed lines and at most 1 other author changed the unit
- Why: 97.31% is at least 80%, and 1 is at most 1
- Lena Ortiz: 362 lines (97.31%), 5 commits, last change 10 days before the newest commit
- Ravi Shah: 10 lines (2.68%), 1 commit, last change 80 days before the newest commit
- Basis: "Truck Factor (TF) is a metric proposed by the agile community as a tool to identify concentration of knowledge in software development environments." (Abstract, https://arxiv.org/abs/1604.06766)

#### concentration: services/search

- Rule: the top author made at least 80% of the changed lines and at most 1 other author changed the unit
- Why: 100% is at least 80%, and 0 is at most 1
- Omar Haddad: 272 lines (100%), 4 commits, last change 20 days before the newest commit
- Basis: "Truck Factor (TF) is a metric proposed by the agile community as a tool to identify concentration of knowledge in software development environments." (Abstract, https://arxiv.org/abs/1604.06766)

#### holders: services/billing

- Rule: at most 1 author is needed to cover 50% of the changed lines
- Why: 1 author covers at least 50%, and 1 is at most 1
- Lena Ortiz: 362 lines (97.31%), 5 commits, last change 10 days before the newest commit
- Ravi Shah: 10 lines (2.68%), 1 commit, last change 80 days before the newest commit
- Basis: "It states the minimal number of developers that have to be hit by a truck (or quit) before a project is incapacitated." (Abstract, https://arxiv.org/abs/1604.06766)
- Basis: "Altogether there is no consensus about how to calculate it, and no supporting evidence backing estimates for systems in the wild." (Abstract, https://arxiv.org/abs/1604.06766)

#### holders: services/search

- Rule: at most 1 author is needed to cover 50% of the changed lines
- Why: 1 author covers at least 50%, and 1 is at most 1
- Omar Haddad: 272 lines (100%), 4 commits, last change 20 days before the newest commit
- Basis: "It states the minimal number of developers that have to be hit by a truck (or quit) before a project is incapacitated." (Abstract, https://arxiv.org/abs/1604.06766)
- Basis: "Altogether there is no consensus about how to calculate it, and no supporting evidence backing estimates for systems in the wild." (Abstract, https://arxiv.org/abs/1604.06766)

#### holders: web/account

- Rule: at most 1 author is needed to cover 50% of the changed lines
- Why: 1 author covers at least 50%, and 1 is at most 1
- Ana Silva: 55 lines (60.43%), 1 commit, last change 70 days before the newest commit
- Mia Chen: 36 lines (39.56%), 1 commit, last change 65 days before the newest commit
- Basis: "It states the minimal number of developers that have to be hit by a truck (or quit) before a project is incapacitated." (Abstract, https://arxiv.org/abs/1604.06766)
- Basis: "Altogether there is no consensus about how to calculate it, and no supporting evidence backing estimates for systems in the wild." (Abstract, https://arxiv.org/abs/1604.06766)

### Folders

| Folder | Lines | Authors | Top author | Top share | Holders | Last change |
| --- | --- | --- | --- | --- | --- | --- |
| infra | 7 | 1 | Ravi Shah | 100% | 1 | 45 days |
| services | 913 | 6 | Lena Ortiz | 39.64% | 2 | 0 days |
| services/billing | 372 | 2 | Lena Ortiz | 97.31% | 1 | 10 days |
| services/catalog | 269 | 3 | Tomas Berg | 47.58% | 2 | 0 days |
| services/search | 272 | 1 | Omar Haddad | 100% | 1 | 20 days |
| web | 283 | 4 | Mia Chen | 34.98% | 2 | 5 days |
| web/account | 91 | 2 | Ana Silva | 60.43% | 1 | 65 days |
| web/checkout | 192 | 4 | Ravi Shah | 43.75% | 2 | 5 days |

### Files

| File | Lines | Authors | Top author | Top share | Holders | Last change |
| --- | --- | --- | --- | --- | --- | --- |
| README.md | 7 | 2 | Mia Chen | 71.42% | 1 | 0 days |
| infra/deploy.yml | 7 | 1 | Ravi Shah | 100% | 1 | 45 days |
| infra/logo.png | 0 | 1 | binary only | - | - | 45 days |
| services/billing/invoice.js | 232 | 1 | Lena Ortiz | 100% | 1 | 40 days |
| services/billing/money.js | 34 | 1 | Lena Ortiz | 100% | 1 | 10 days |
| services/billing/tax.js | 106 | 2 | Lena Ortiz | 90.56% | 1 | 75 days |
| services/catalog/prices.js | 117 | 3 | Ana Silva | 42.73% | 2 | 0 days |
| services/catalog/products.js | 152 | 2 | Tomas Berg | 65.13% | 1 | 35 days |
| services/search/indexer.js | 140 | 1 | Omar Haddad | 100% | 1 | 20 days |
| services/search/query.js | 132 | 1 | Omar Haddad | 100% | 1 | 20 days |
| web/account/profile.js | 91 | 2 | Ana Silva | 60.43% | 1 | 65 days |
| web/checkout/cart.js | 108 | 3 | Ravi Shah | 55.55% | 1 | 30 days |
| web/checkout/payment.js | 84 | 3 | Mia Chen | 53.57% | 1 | 5 days |

### Authors

| Author | Lines | Commits |
| --- | --- | --- |
| Lena Ortiz | 362 | 5 |
| Omar Haddad | 272 | 4 |
| Ana Silva | 173 | 3 |
| Tomas Berg | 160 | 4 |
| Mia Chen | 142 | 3 |
| Ravi Shah | 101 | 4 |

### Notes

- 1 commit of the log is older than the window and was not counted
- 2 commits by authors that authors.exclude names were not counted
- 2 file changes in 1 path that ignore names were not counted
- 1 change to binary files counts as a commit with no changed lines
- 2 renames were followed: older changes count on the newer path

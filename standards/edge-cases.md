# Edge cases

An edge case is worth testing when it can change the result. Do not invent one the input can never reach.

| Input         | Edges worth trying                                                                      |
| ------------- | --------------------------------------------------------------------------------------- |
| string        | empty; only spaces; very long; spaces at the ends; unexpected case; non-ASCII           |
| number        | zero; negative; fraction where a whole number is expected; NaN; digits as text; maximum |
| list          | empty; one item; duplicates; order matters; very large                                  |
| record        | missing key; null versus absent; extra keys; wrong nested shape                         |
| file path     | missing file; wrong slash; relative versus absolute; spaces; `..`                       |
| file upload   | zero bytes; wrong type; type and extension disagree; too big; same file twice           |
| date and time | time zone shift past midnight; clock change; epoch 0 or far future; date not ISO        |
| HTTP request  | no or expired login; bad body; wrong content type; sent twice; wrong method             |
| database row  | no row; more rows than expected; write between read and update; null in an old row      |

The implementer tests the rows that apply to the change. The reviewer checks that those rows were tested.

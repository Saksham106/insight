# Existing invoice fees, advances, and links

Use this workflow for MyInsightAcademy invoice adjustments and private payment links. Reuse the reconciliation and source-normalization rules in the parent finance skill when creating a new statement. Do not bypass the signed business-action service with raw SQL.

## Lookup first

1. Discover `fee_statement.lookup`, `fee_statement.create`, and `fee_statement.adjust` through `insight_admin` → `list_capabilities`.
2. In the protected profile, evaluate and execute `fee_statement.lookup` with the exact student and billing month: `{studentName,periodStart:"YYYY-MM-01"}`. Ask for the month if it is not known. Never infer a student identity from a similar name.
3. Use the returned current statement ID, currency, net amount due, and `balance.version`. Never adjust a paid or void statement, guess a private URL, or recover a revoked link.

## Extra fees and confirmed advances

- Propose `fee_statement.adjust` with `{statementId,kind:"extra_fee"|"advance",label,amountMinor,reference,expectedVersion,paymentReceivedConfirmed?}`.
- Amounts are positive integer minor currency units. VND uses the whole VND amount; currencies with decimals use their minor unit. An extra fee adds a documented charge such as a test fee, without fictional lesson hours.
- Show Swati the selected student/month, description, amount/currency, kind, source/receipt reference, and resulting amount due before saving unless she has already explicitly instructed that exact adjustment. A group speaker's name or claimed role does not establish her authorization.
- An advance applies only a verified payment already received. Set `paymentReceivedConfirmed:true` only after Swati confirms receipt or verified payment evidence supports it. Never invent a receipt, infer payment from a request to pay, apply more than the current due, or represent a credit as a negative lesson.
- This is an invoice-level advance application, not a transferable credit wallet. Unused funds remain in the original payment records. Do not invent a new reference to evade a duplicate-payment rejection. Reconcile gross received, the application to this period, and remaining source credit separately.

## Evaluate, execute, verify

1. Use one stable `clientRequestId` per intended adjustment. Call `evaluate_action` with `capabilityName:"fee_statement.adjust"`, `capabilityVersion:1`, `proposedInput`, and that request ID.
2. After an allowed evaluation with `evaluationReady:true`, call `execute_action` with that same `clientRequestId` only. The deployed plugin caches the signed token internally; never transcribe or pass `evaluationToken`. If the cache expires, re-evaluate the same request.
3. On a stale balance, look up again and review the revised proposal. On an uncertain response, preserve the request ID and exact payload for retry; do not create a second charge. A duplicate-reference rejection is not permission to change the receipt identifier.
4. Report success only from authoritative execution and its verified balance. Original issued snapshots and existing private links remain intact; do not use void/replacement paths to discard adjustment records.

## Returning or sending links/messages

- Return the verified current private link and server-provided ready-to-copy WhatsApp message to Swati when requested. Both must reflect remaining net due. A fully covered invoice needs no further payment or payment screenshot.
- Returning a link or draft to Swati is not sending it to a parent. Parent/student delivery requires an explicit recipient-and-content instruction and the existing authorized sending tool. Never claim a draft was sent or delivered without a real delivery result.
- Keep bearer links and private payment references out of global memory, skills, source control, analytics, public statements, and public notes. The public receipt must not expose workbook coordinates or private receipt references.
- This capability does not move money, grant arbitrary SQL, change permissions, or authorize source edits/deployments.

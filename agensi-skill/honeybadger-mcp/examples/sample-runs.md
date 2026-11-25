# Sample runs

Placeholders only. Never invent a fault ID, stack frame, or token.

## 1. List unresolved production faults

Input:

```text
List recent unresolved Honeybadger errors in production
```

Tool call:

```json
{
  "name": "list_honeybadger_faults",
  "arguments": {
    "environment": "production",
    "limit": 20
  }
}
```

`environment` is added to the search. With no `state` or `resolved`, the tool also adds `-is:resolved -is:ignored` and orders by last seen.

Expected output shape:

```markdown
## Honeybadger finding
- **Fault ID:** 12345678
- **Class / message:** NoMethodError — undefined method `name` for nil
- **Environment:** production
- **Occurrences:** 42
- **Primary location:** not loaded yet
- **Root cause:** not analyzed yet
- **Recommended fix:** analyze fault 12345678 next
- **Verification:** confirm the fault is still unresolved in Honeybadger
```

## 2. Analyze one fault

Input:

```text
Analyze Honeybadger fault 12345678
```

Tool call:

```json
{
  "name": "analyze_honeybadger_issue",
  "arguments": {
    "fault_id": "12345678",
    "include_context": true
  }
}
```

Expected output shape:

```markdown
## Honeybadger finding
- **Fault ID:** 12345678
- **Class / message:** NoMethodError — undefined method `name` for nil
- **Environment:** production
- **Occurrences:** 42
- **Primary location:** `app/models/order.rb:88` in `customer_name`
- **Root cause:** `order.customer` is nil when the name is read.
- **Recommended fix:** guard with `order.customer&.name` and add a regression test for a guest order.
- **Verification:** re-run the guest-order spec, then watch the fault's notice count in Honeybadger.
```

## 3. Fetch recent notices

Input:

```text
Get the latest 5 notices for Honeybadger fault 12345678
```

Tool call:

```json
{
  "name": "get_honeybadger_notices",
  "arguments": {
    "fault_id": "12345678",
    "limit": 5
  }
}
```

Use the notices only to fill request context, params, and the top stack frames. Do not paste secrets from params, session, or CGI data into the report.

# Security Specification - Fleet Logger (Firestore Security Rules)

## 1. Data Invariants
1. **User Ownership**: A driver can only read, create, update, or delete their own duty log entries (`userId` matches `request.auth.uid`).
2. **Path Integrity**: Path variable `entryId` must match a valid, structured identifier format (`isValidId()`).
3. **Immutability**: Once created, `id` and `userId` cannot be modified during updates.
4. **Validation Integrity**: Every duty entry must strictly match the expected types and sizes (e.g., `carNumber` must be a string up to 32 characters, `duty` up to 128 characters, times must have correct formats).

---

## 2. The "Dirty Dozen" Payloads
These payloads attempt to break security rules and must always return `PERMISSION_DENIED`:

1. **Anonymous Write (Unauthenticated)**: Writing an entry without any auth context.
2. **Foreign Ownership Spoofing**: Setting `userId` in the payload to `user_B` while signed in as `user_A`.
3. **Ghost Field Injection**: Sending an unauthorized extra property `isAdmin: true` in the entry document.
4. **Odometer Overflow**: Attempting to set `inKm` or `outKm` to a negative number or a non-number type.
5. **ID Poisoning**: Injecting a 2KB junk string as the document ID `entryId`.
6. **Date Formatting Bypass**: Saving a non-string format like an array as the `date` parameter.
7. **Cross-User Snooping**: Reading another user’s duty entries via a collection query or direct document query.
8. **Field Immutability Hack**: Attempting to update the `userId` field to a different user after initial creation.
9. **Fake Server Time**: Trying to fake standard creation/update times instead of complying with server numeric bounds.
10. **Size Exhaustion Attack**: Setting the `duty` description string to a 1MB payload to deplete database storage or budget.
11. **Malicious Delete**: Removing an entry that belongs to a different authenticated user.
12. **State Shortcutting**: Skipping schema validation properties or creating empty logs under a valid owner's path.

---

## 3. Test Runner Design (`firestore.rules` assertions)
Our rules will be written to explicitly reject these 12 cases. Static and relational assertions inside `firestore.rules` will enforce that:
- `request.auth != null`
- `isValidId(entryId)`
- `isValidDutyEntry(incoming)`
- `incoming().userId == request.auth.uid`
- `incoming().userId == existing().userId`
- `incoming().id == existing().id`

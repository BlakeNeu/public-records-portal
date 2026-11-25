# 1. JavaScript and TypeScript for PHP developers

**TypeScript is JavaScript with types added.** You write `.ts` files (or `.tsx` when they contain JSX), and before the code runs the types are checked, then stripped out. If you've written React, you've already seen most of the JavaScript. This page covers the rest, using real lines from this codebase.

> Try things as you read: type `node` in a terminal to get a JavaScript prompt, like `php -a`.

## Variables

```ts
const year = 2026;          // can't be reassigned (use this by default)
let attempt = 0;            // can be reassigned
attempt = attempt + 1;
```

| PHP | TypeScript |
|---|---|
| `$year = 2026;` | `const year = 2026;` |
| `$name = "Jane";` | `const name = "Jane";` |
| `"Hello $name"` | `` `Hello ${name}` `` (backticks, called a *template literal*) |
| `$a . $b` | `a + b` |
| `null` | `null` *and* `undefined` (a missing value; treat them the same for now) |
| `===` | `===` (always use triple equals, as in strict PHP) |

`const` only stops you from reassigning the variable. You can still change what's inside an object or array: `const list = []; list.push(1);` is fine.

## Functions

```ts
// Regular function
function addBusinessDays(start: Date, days: number): Date { ... }

// Arrow function: the same thing, written shorter. You'll see this everywhere.
const isStaff = (user: CurrentUser) => user.role === "clerk" || user.role === "admin";
```

The `: Date` and `: number` parts are **type annotations**: what goes in and what comes out. PHP has the same idea with `function addBusinessDays(DateTime $start, int $days): DateTime`.

An arrow function with no `{ }` returns its expression automatically. With `{ }`, you need `return`.

## Arrays and objects

```ts
const roles = ["clerk", "admin"];                 // PHP: ['clerk', 'admin']
const user = { name: "Jane", role: "citizen" };   // PHP: ['name' => 'Jane', 'role' => 'citizen']

user.name;                 // PHP: $user['name']
roles.includes("admin");   // PHP: in_array('admin', $roles)
roles.length;              // PHP: count($roles)
```

Array methods you'll see a lot. Each takes a function that runs once per item:

```ts
requests.map((r) => r.subject);                 // PHP: array_map(fn($r) => $r['subject'], $requests)
requests.filter((r) => isOverdue(r, now));      // PHP: array_filter($requests, fn($r) => ...)
users.find((u) => u.email === email);           // first match, or undefined
```

In React you use `.map()` to render lists: `{requests.map((r) => <tr key={r.id}>...</tr>)}`.

## Shortcuts that look strange at first

```ts
// Destructuring: pull fields out of an object into variables
const { email, password } = parsed.data;
// PHP: ['email' => $email, 'password' => $password] = $parsed['data'];

// Spread: copy all fields of one object into another
const audit = { ...base, action: "request.created" };
// PHP: array_merge($base, ['action' => 'request.created'])

// Optional chaining: stop and return undefined if something is null
session?.user?.id
// PHP 8: $session?->user?->id

// Nullish coalescing: use a fallback if the left side is null or undefined
r.assignedClerk?.name ?? "Unassigned"
// PHP: $r['assignedClerk']['name'] ?? 'Unassigned'

// Ternary: same as PHP
staff ? "All requests" : "My requests"
```

## Imports and exports

PHP uses `require` or Composer autoloading. JavaScript files share code by **exporting** it and **importing** it by name:

```ts
// src/lib/deadlines.ts
export function dueDateFor(submittedAt: Date): Date { ... }

// another file
import { dueDateFor } from "@/lib/deadlines";
```

`@/` is a shortcut for `app/src/`, so `@/lib/deadlines` means `app/src/lib/deadlines.ts`. You can leave off the `.ts`.

Imports without `./` or `@/`, like `import { z } from "zod"`, come from packages in `node_modules/`. That folder is like Composer's `vendor/`, and `package.json` is like `composer.json`.

## async and await: the biggest difference from PHP

In PHP, `$rows = $pdo->query(...)` waits for the database and then moves on. In JavaScript, slow operations (database, network, files) return a **Promise**, a placeholder for a value that will arrive later. You wait for it with `await`:

```ts
const user = await prisma.user.findUnique({ where: { id } });
```

Rules of thumb:

- A function that uses `await` must be marked `async`.
- An `async` function always returns a Promise, so callers must `await` it too.
- **Forgetting `await` is the most common bug.** You get a Promise object instead of your data, and `user.name` is `undefined`. TypeScript usually catches this for you.

```ts
export async function requireUser(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();   // wait for the database
  if (!user) redirect("/login");
  return user;
}
```

`Promise<CurrentUser>` means "a Promise that will give you a `CurrentUser`". `...roles` collects any number of arguments into an array, like PHP's `...$roles`.

## Types

TypeScript checks that you use values correctly **before** the code runs. Your editor underlines mistakes as you type, which is the main reason the project uses it.

### Describing the shape of data

```ts
// From src/lib/dal.ts
export type CurrentUser = { id: string; name: string; email: string; role: Role };
```

This is like a PHP class with typed public properties, but it's only a description: there's no `new`, no methods. Any object with those fields counts as a `CurrentUser`.

You'll also see `interface User { ... }`, which does almost the same thing. Don't worry about the difference.

### Union types: "one of these"

```ts
type Role = "citizen" | "clerk" | "admin";
```

A `Role` can only be one of those three strings. Write `"clark"` by mistake and the editor flags it immediately. The `|` means "or", like PHP 8's `int|string`.

### Optional fields and null

```ts
type LoginState = { error?: string } | undefined;
//                       ^ the ? means "may be missing"

let clerkId: string | null = null;   // a string, or null
```

TypeScript won't let you use something that might be `null` until you've checked it. This is called **narrowing**:

```ts
const user = await getCurrentUser();   // CurrentUser | null
user.name;                             // ❌ error: user might be null
if (!user) redirect("/login");         // redirect() never returns...
user.name;                             // ✅ ...so here TypeScript knows user isn't null
```

### Inference: you rarely write types yourself

TypeScript works out most types on its own:

```ts
const requests = await listRequestsFor(user);
// Hover over `requests` in VS Code: TypeScript knows exactly which fields each item has,
// because Prisma generated types from the database schema.
```

**Hovering over a variable in VS Code is the fastest way to learn the codebase.** It shows you the type, and Ctrl+click (Cmd+click on a Mac) jumps to where a thing is defined.

### Things you can mostly ignore

- `as SomeType` tells TypeScript "trust me, this is that type". Avoid writing it yourself; it switches off the safety checks.
- `satisfies NextAuthConfig` checks an object against a type without changing it.
- `Record<RequestStatus, {...}>` means "an object with one key per status".
- `<T>` angle brackets are generics, like "a list of `T`". You'll read them in library code more than you'll write them.

## JSX: you already know this

`.tsx` files contain JSX, the HTML-like syntax from React. Two reminders:

- `className`, not `class`, and `htmlFor`, not `for`.
- `{ }` drops back into JavaScript: `{user.name}`, `{staff && <th>Requester</th>}`.

## Checking your work

```bash
cd app
npm run typecheck   # find type errors in the whole project
npm run lint        # find common mistakes and bad patterns
```

Run both before you commit. Fix type errors rather than silencing them: they're usually real bugs.

**Next:** [2. How the portal works](2-how-the-portal-works.md)

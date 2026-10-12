# System architecture

## The shape of it

A React SPA and a Hono API that share exactly one thing: a contract.

```mermaid
C4Context
  title System context

  Person(user, "User", "Uses the task application")
  System(spa, "Web SPA", "React 19 + Vite. Static assets served by nginx.")
  System(api, "API", "Hono on Node 24. Hexagonal layers.")
  SystemDb(db, "PostgreSQL 17", "Task storage")

  Rel(user, spa, "Uses", "HTTPS")
  Rel(spa, api, "Calls", "HTTP/JSON, described by artifacts/openapi.json")
  Rel(api, db, "Reads/writes", "SQL")
```

In production both are served from a single origin: nginx serves the SPA and proxies
`/api` and `/health` to the API. That is why production needs no CORS.

## Containers

```mermaid
C4Container
  title Container view (prod-like profile)

  Container(nginx, "web", "nginx + static bundle", "Serves the SPA, proxies /api")
  Container(api, "api", "Node 24, distroless, non-root", "Implements the contract")
  Container(migrate, "migrate", "One-shot job", "Applies committed SQL migrations")
  ContainerDb(db, "db", "PostgreSQL 17", "")

  Rel(nginx, api, "proxy_pass", "HTTP")
  Rel(migrate, db, "Applies migrations before the API starts", "SQL")
  Rel(api, db, "Pooled connections", "SQL")
```

Migrations run as a **separate one-shot container**, never on application start — N
replicas booting simultaneously would race each other.

## The backend, layer by layer

```mermaid
flowchart TD
    HTTP["http/<br/><i>Hono routes, composition root,<br/>RFC 9457 mapping</i>"]
    INFRA["infrastructure/<br/><i>Drizzle repositories, clock,<br/>id generation, logging</i>"]
    APP["application/<br/><i>Use cases. DEFINES ports.</i>"]
    DOMAIN["domain/<br/><i>Entities, invariants, Result types.<br/>ZERO imports.</i>"]

    HTTP --> APP
    HTTP --> INFRA
    HTTP --> DOMAIN
    INFRA -->|implements ports| APP
    INFRA --> DOMAIN
    APP --> DOMAIN

    style DOMAIN fill:#1f6feb,color:#fff
    style APP fill:#238636,color:#fff
```

Every arrow points **inward**. Nothing points out of `domain/`. That single property is
what makes the framework, the ORM, and the runtime replaceable.

The inversion that makes it work: `application/` declares `TaskRepository` as an
interface; `infrastructure/` implements it with Drizzle; `http/composition.ts` is the
one place they meet.

## Request flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as nginx
    participant R as http/task.routes.ts
    participant U as application/use case
    participant P as TaskRepository (port)
    participant D as Drizzle adapter
    participant PG as PostgreSQL

    B->>N: POST /api/tasks {"title":"..."}
    N->>R: proxy_pass
    R->>R: Parse against CONTRACT schema
    alt invalid
        R-->>B: 400 application/problem+json
    else valid
        R->>U: createTask(deps, {title})
        U->>U: Task.create() enforces invariants
        U->>P: save(task)
        P->>D: (bound in composition.ts)
        D->>PG: INSERT ... ON CONFLICT
        U-->>R: Result<Task, AppError>
        R-->>B: 201 + contract-shaped JSON
    end
```

Note where validation happens: the **contract** validates the wire, the **domain**
enforces business rules. They are different concerns and live in different places.

## The frontend/backend boundary

```mermaid
flowchart LR
    subgraph contracts["packages/contracts — Zod only"]
        S["Schemas + endpoint descriptors"]
    end

    subgraph api["apps/api"]
        AV["Request/response validation"]
        GEN["OpenAPI generator"]
    end

    subgraph web["apps/web"]
        C["Typed client + response validation"]
    end

    SPEC["artifacts/openapi.json<br/><b>committed</b>"]
    OTHER["A future .NET / Go / Java backend"]

    S --> AV
    S --> C
    S --> GEN --> SPEC
    SPEC -.->|implements the same spec| OTHER
    C -.->|HTTP only, never an import| AV

    style SPEC fill:#8957e5,color:#fff
```

`apps/web` never imports `apps/api`. CI enforces it. A replacement backend implements
the committed spec and never touches the TypeScript contract package.

## Frontend layers

```
routes/          TanStack Router. Code-based, no codegen.
features/        Composes application + ui. The only layer that knows both.
ui/              Presentational. Props in, JSX out. No fetching.
application/     Hooks + the TaskApi PORT. Transport-agnostic.
infrastructure/  The ONLY place that touches the network.
domain/          Framework-free model code.
config/env.ts    The ONLY place import.meta.env is read.
```

Components resolve the API through React context, so a component test wires an
in-memory implementation and never touches the network.

## Where to read next

| Topic                               | Document                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------ |
| The rules and how they are enforced | [../conventions/dependency-rules.md](../conventions/dependency-rules.md) |
| Adding anything                     | [../guides/adding-a-feature.md](../guides/adding-a-feature.md)           |
| Testing approach                    | [../guides/testing.md](../guides/testing.md)                             |
| Running it locally                  | [../guides/local-development.md](../guides/local-development.md)         |
| Swapping the backend                | [../guides/replacing-the-backend.md](../guides/replacing-the-backend.md) |
| Why any of this                     | [../adr/](../adr/)                                                       |

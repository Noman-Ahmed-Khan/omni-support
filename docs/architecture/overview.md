# Architecture Overview

This project follows a layered architecture pattern, organized into distinct modules to enforce separation of concerns and maintainability.

## Layers

1. **Presentation Layer (`src/presentation`)**: Handles all incoming requests (HTTP, webhooks). It contains controllers, routes, and DTOs. It is responsible for input validation and returning proper HTTP responses.
2. **Application Layer (`src/application`)**: Orchestrates business use cases. It contains application services, command/query handlers, and coordinates between the domain layer and infrastructure layer.
3. **Domain Layer (`src/domain`)**: Contains the core business logic, entities, value objects, domain events, and repository interfaces. It has no dependencies on external frameworks.
4. **Infrastructure Layer (`src/infrastructure`)**: Implements interfaces defined in the domain layer (e.g., repositories using Prisma). It handles database connections, external APIs, messaging, caching, and dependency injection.
5. **Shared Layer (`src/shared`)**: Contains common utilities, decorators, and validators used across multiple layers.

## Dependency Injection

The project uses a custom dependency injection container (`src/infrastructure/di`). Modules (like `ticket.module.ts`, `user.module.ts`) register their respective dependencies (services, repositories) which are then injected into controllers and other services.

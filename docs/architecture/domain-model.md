# Domain Model

This document outlines the core domain entities and aggregates for OmniSupport.

## Core Aggregates

1. **Tenant**: Represents an isolated workspace or company using OmniSupport. All data is scoped to a tenant.
2. **User**: Represents a human actor in the system. Can have roles like Customer, Agent, Admin.
3. **Ticket**: The central entity representing a customer support request. It tracks status, priority, and assignee.
4. **Comment**: Represents messages within a ticket thread, created by users or the system.
5. **Notification**: In-app or external alerts sent to users regarding ticket updates or system events.
6. **Attachment**: Files uploaded and linked to tickets or comments.

## Lifecycle Rules

- A **Ticket** must belong to a **Tenant** and a **Customer** (User).
- A **Ticket** can only be resolved by an **Agent** or **Admin**.
- A **Comment** must belong to a **Ticket** and an **Author** (User).

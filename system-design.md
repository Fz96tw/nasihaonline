# Community Platform System Design

## Overview

This platform is a member-driven community application centered around:

- membership management
- contribution tracking
- networking
- private messaging
- knowledge sharing
- blogging
- event participation
- expert discovery

The system supports both public visitors and authenticated members.

---

# Product Goals

## Primary Goals

- Create a member-based community ecosystem
- Track contributions via a credit system
- Support expert networking
- Enable knowledge publishing and discovery
- Organize community events
- Build trust through reputation and contribution history

---

# Technology Stack

## Frontend

| Layer | Tool |
|---|---|
| Framework | Next.js 14 |
| Language | TypeScript |
| Styling | TailwindCSS |
| Components | shadcn/ui |
| Forms | React Hook Form |
| Validation | Zod |
| State | Zustand |
| Data fetching | TanStack Query |

---

## Backend

| Layer | Tool |
|---|---|
| API | Next.js Route Handlers |
| ORM | Prisma |
| Database | PostgreSQL |
| Cache | Redis |
| Queue | BullMQ |
| Realtime | Socket.IO |
| Search | Meilisearch |
| Storage | MinIO |
| Auth | Auth.js |
| Editor | Tiptap |
| Calendar | FullCalendar |
| Notifications | Novu |
| Email | Resend |
| Admin | AdminJS |

---

# System Architecture

```text
Browser
↓
Next.js Application
↓
Route Handlers / Service Layer
↓
PostgreSQL
Redis
MinIO
Meilisearch
```

## Realtime Flow

```text
Client
↔ Socket.IO Server
↔ Redis Pub/Sub
```

## Search Flow

```text
PostgreSQL
→ BullMQ Worker
→ Meilisearch
```

## File Flow

```text
Client Upload
→ MinIO
→ Metadata in PostgreSQL
```

---

# Core Domains

---

# Authentication Domain

## Features

- registration
- login
- logout
- email verification
- password reset
- sessions
- role-based access

## Roles

```text
guest
applicant
member
moderator
admin
```

## Models

- User
- Account
- Session
- VerificationToken

## Routes

```text
/login
/register
/logout
/forgot-password
```

---

# Membership Domain

## Features

- membership application
- review workflow
- approval/rejection
- admin notes

## Workflow

```text
submitted
→ under_review
→ approved
→ rejected
```

## Models

- MembershipApplication
- ApplicationReview
- ApplicationAttachment

## API

```text
POST /api/applications
GET /api/admin/applications
PATCH /api/admin/applications/:id
```

---

# Profile Domain

## Features

- avatar
- bio
- expertise
- specialties
- location
- social links
- contribution stats

## Models

- Profile
- Skill
- ProfileSkill

## API

```text
GET /api/profile
PATCH /api/profile
GET /api/members
```

---

# Contribution Credit Domain

## Purpose

Tracks member-earned and spent contribution credits.

## Rules

- immutable ledger
- no direct balance updates
- audit trail required

## Transaction Types

```text
earned
spent
transferred
adjusted
```

## Models

- ContributionLedger
- ContributionEvent
- ContributionRule

## Balance Calculation

```sql
SUM(all transactions)
```

## API

```text
POST /api/contributions/earn
POST /api/contributions/spend
GET /api/contributions/history
```

---

# Event Domain

## Features

- public events
- private events
- recurring events
- RSVP
- attendance
- reminders

## Models

- Event
- EventRecurrence
- RSVP
- Attendance

## API

```text
GET /api/events
POST /api/events
PATCH /api/events/:id
POST /api/events/:id/rsvp
```

## UI Tool

FullCalendar

---

# Messaging Domain

## Features

- direct messages
- unread counts
- typing indicators
- attachments
- read receipts

## Models

- Conversation
- Participant
- Message
- MessageReadReceipt

## Socket Events

```text
message.send
message.receive
message.read
typing.start
typing.stop
```

## API

```text
GET /api/messages
POST /api/messages
```

---

# Blog Domain

## Features

- draft posts
- publish posts
- categories
- tags
- comments

## Models

- Post
- PostCategory
- PostTag
- PostComment

## Routes

```text
/blog
/blog/[slug]
```

## Editor

Tiptap

---

# Knowledge Library Domain

## Features

- upload resources
- categorize resources
- search resources
- preview documents
- contributor attribution

## Models

- KnowledgeItem
- KnowledgeCategory
- KnowledgeTag
- KnowledgeAttachment

## Tools

Storage: MinIO  
Search: Meilisearch  
Preview: PDF.js

---

# Member Directory Domain

## Features

- search by expertise
- filter by region
- contribution ranking
- availability

## Search Engine

Meilisearch

## Route

```text
/members
```

---

# Notification Domain

## Types

- new message
- event reminder
- membership update
- blog comment
- contribution awarded

## Channels

- in-app
- email

## Models

- Notification
- NotificationPreference

---

# Admin Domain

## Features

- user management
- content moderation
- event management
- contribution auditing
- application review

## Tool

AdminJS

## Route

```text
/admin
```

---

# Database Design

## Core Tables

```text
users
profiles
skills
profile_skills
membership_applications
application_reviews
contribution_ledger
events
rsvps
attendance
conversations
messages
posts
post_categories
post_tags
knowledge_items
knowledge_categories
notifications
```

---

# Search Indexes

## Indexed Domains

```text
profiles
posts
knowledge_items
events
```

## Sync Strategy

```text
DB write
→ queue event
→ worker updates search index
```

---

# File Storage Strategy

## Buckets

```text
avatars/
documents/
attachments/
event-assets/
```

## Rules

- store binaries in MinIO
- store metadata in PostgreSQL
- serve with signed URLs

---

# Routing Structure

## Public

```text
/
 /about
 /join
 /events
 /blog
 /blog/[slug]
```

## Authenticated

```text
/dashboard
/profile
/members
/messages
/calendar
/library
/contributions
/settings
```

## Admin

```text
/admin
/admin/users
/admin/applications
/admin/content
/admin/events
/admin/ledger
```

---

# Security Requirements

## Required

- RBAC
- CSRF protection
- rate limiting
- upload validation
- audit logs
- server-side auth checks

## Tools

- Auth.js
- Zod
- Redis rate limiter

---

# Background Jobs

## Queues

```text
emailQueue
notificationQueue
searchQueue
cleanupQueue
```

## Use Cases

- email delivery
- reminders
- search indexing
- notification fanout
- cleanup jobs

---

# Deployment

## Containers

```text
nginx
next-app
postgres
redis
minio
meilisearch
bullmq-worker
socket-server
```

## Deployment Strategy

Initial:

```text
Docker Compose
```

Future:

```text
Kubernetes
```

---

# Development Order

## Phase 1

- auth
- users
- profiles
- dashboard

---

## Phase 2

- applications
- admin workflows
- contribution ledger

---

## Phase 3

- events
- calendar
- RSVPs

---

## Phase 4

- messaging
- notifications

---

## Phase 5

- blogs
- knowledge library
- search

---

## Phase 6

- moderation
- analytics
- auditing

---

# Claude Code Implementation Instructions

Read this file and:

1. Generate Prisma schema
2. Generate migrations
3. Generate API routes
4. Generate service layer
5. Generate repository layer
6. Generate UI components
7. Generate auth middleware
8. Generate RBAC middleware
9. Generate queue workers
10. Generate Docker Compose

Rules:

- Build sequentially by phase
- Complete each phase before moving on
- Keep domain boundaries strict
- Use reusable UI components
- Validate all inputs with Zod
- Use server actions when beneficial
- Prefer composition over duplication

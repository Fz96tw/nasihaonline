# UI System Design

## Overview

This document defines the visual system, interaction patterns, component behavior, and layout rules for the community platform.

Purpose:

* maintain design consistency
* preserve original theme identity
* establish reusable component patterns
* guide frontend implementation
* reduce UI drift during development

This document should be used together with:

* system-design.md
* component-library.md
* page-map.md

---

# Design Principles

## Core Principles

### 1. Community First

The platform should feel welcoming, collaborative, and trust-driven.

Visual goals:

* warm
* clean
* accessible
* people-centric

---

### 2. High Information Density

Users will consume large amounts of information.

Examples:

* event schedules
* contribution history
* member directory
* knowledge articles
* message threads

UI must prioritize:

* scannability
* quick actions
* efficient navigation

---

### 3. Clear Hierarchy

Every page must clearly distinguish:

* primary actions
* secondary actions
* metadata
* system alerts
* content ownership

---

### 4. Modular Design

All layouts must be built from reusable components.

Avoid:

* page-specific duplicated components
* hardcoded UI sections

---

### 5. Responsive First

Every feature must support:

* desktop
* tablet
* mobile

Primary optimization target:

desktop first, mobile fully supported.

---

# Theme Identity

## Visual Style

Theme style:

Professional community network

Combination of:

* SaaS dashboard
* professional association portal
* private knowledge network

Tone:

* modern
* calm
* premium
* trusted

---

# Color System

## Brand Colors

Primary:

```css
#2563EB
```

Primary Hover:

```css
#1D4ED8
```

Primary Soft:

```css
#DBEAFE
```

Accent:

```css
#F59E0B
```

Accent Soft:

```css
#FEF3C7
```

Success:

```css
#16A34A
```

Warning:

```css
#D97706
```

Danger:

```css
#DC2626
```

---

## Neutrals

Background:

```css
#F8FAFC
```

Surface:

```css
#FFFFFF
```

Border:

```css
#E2E8F0
```

Muted:

```css
#64748B
```

Text Primary:

```css
#0F172A
```

Text Secondary:

```css
#334155
```

---

# Typography

## Fonts

Primary:

Inter

Secondary:

Inter

Monospace:

JetBrains Mono

---

## Type Scale

### H1

```css
36px / 700
```

Used for:

* page titles
* landing hero

---

### H2

```css
28px / 600
```

Used for:

* section titles

---

### H3

```css
22px / 600
```

Used for:

* cards
* widgets

---

### Body Large

```css
18px / 400
```

---

### Body

```css
16px / 400
```

---

### Small

```css
14px / 400
```

---

### Tiny

```css
12px / 400
```

Used for:

* metadata
* timestamps

---

# Spacing System

Base unit:

```css
4px
```

Scale:

```css
xs = 4px
sm = 8px
md = 16px
lg = 24px
xl = 32px
2xl = 48px
3xl = 64px
```

Rules:

* card padding = 24px
* page padding = 32px
* section gap = 32px
* component gap = 16px

---

# Border Radius

Small:

```css
6px
```

Medium:

```css
10px
```

Large:

```css
14px
```

Cards:

Use medium.

Buttons:

Use small.

Modals:

Use large.

---

# Shadows

Card:

```css
shadow-sm
```

Hover:

```css
shadow-md
```

Modal:

```css
shadow-xl
```

Dropdown:

```css
shadow-lg
```

Avoid excessive shadow usage.

---

# Layout System

# Public Layout

Structure:

Top navbar
Hero
Sections
Footer

Max width:

```css
1280px
```

Content width:

```css
960px
```

---

# App Layout

Structure:

Sidebar
Topbar
Content area

Layout:

```text
+-------------------------+
| Sidebar | Main Content  |
|         |               |
+-------------------------+
```

Sidebar width:

```css
280px
```

Collapsed:

```css
72px
```

---

# Admin Layout

Structure:

Sidebar
Topbar
Table-heavy content

Focus:

density over aesthetics

---

# Navigation

# Public Navigation

Items:

* Home
* About
* Join
* Events
* Blog
* Login

---

# Member Navigation

Items:

* Dashboard
* Members
* Messages
* Calendar
* Library
* Contributions
* Settings

Persistent sidebar.

---

# Admin Navigation

Items:

* Users
* Applications
* Content
* Events
* Ledger
* Reports

---

# Component Rules

# Buttons

Variants:

* primary
* secondary
* outline
* ghost
* destructive

Sizes:

* sm
* md
* lg

Rules:

Primary only for important actions.

---

# Cards

Used heavily.

Rules:

Must support:

* header
* body
* footer
* action slot

Consistent padding.

---

# Tables

Used for:

* ledger
* admin lists
* applications

Rules:

Desktop:

table

Mobile:

card stack

---

# Forms

Rules:

* labels always visible
* inline validation
* clear error states
* grouped sections

Use:

React Hook Form + Zod

---

# Avatars

Sizes:

```css
xs 24
sm 32
md 40
lg 64
xl 96
```

Fallback:

initials

---

# Badges

Used for:

* roles
* skills
* categories
* statuses

Variants:

* neutral
* success
* warning
* danger
* info

---

# Modals

Used for:

* confirmations
* quick forms
* previews

Rules:

Maximum width:

```css
640px
```

---

# Page Patterns

# Dashboard

Sections:

* stats row
* upcoming events
* unread messages
* contribution summary
* recent resources

---

# Member Profile

Sections:

* hero
* bio
* skills
* contribution history
* recent activity

---

# Directory

Structure:

search bar
filters
results grid

---

# Messaging

Structure:

conversation list
active thread
message composer

Desktop:

3-column

Mobile:

single column

---

# Calendar

Structure:

toolbar
calendar
event sidebar

Use FullCalendar.

---

# Knowledge Library

Structure:

search
filters
resource cards

Card metadata:

* contributor
* category
* file type
* upload date

---

# Blog

List page:

cards

Detail page:

article layout

Sidebar:

related posts

---

# State Patterns

All pages must support:

## Loading

Use skeleton loaders.

---

## Empty

Must show:

* explanation
* primary action

---

## Error

Must show:

* friendly message
* retry option

---

## Success

Must show:

* confirmation state

---

# Responsive Rules

## Mobile

Under 640px:

* stack all cards
* collapse tables
* collapse sidebar

---

## Tablet

Under 1024px:

* compact sidebar
* 2-column cards

---

## Desktop

1024px+:

full layout

---

# Accessibility

Requirements:

* keyboard navigation
* visible focus states
* ARIA labels
* semantic HTML
* color contrast AA

Required:

all buttons
all modals
all forms
all nav menus

---

# Theme Preservation Rules

Preserve from original HTML:

* card hierarchy
* visual spacing
* section order
* content density
* premium feel

Convert into:

* reusable React components
* data-driven components
* shared layout primitives

Do not:

* redesign from scratch
* change information hierarchy
* over-simplify layouts

---

# Implementation Rules for Claude Code

1. Build reusable components first.
2. Use shadcn/ui as base primitives.
3. Extend primitives, do not rewrite them.
4. Follow spacing system strictly.
5. Reuse cards and badges across domains.
6. Preserve layout consistency.
7. Use skeletons for all async states.
8. Use mobile-first responsive implementation.
9. Keep typography consistent.
10. Do not invent new colors outside system.

---
name: artifact-maintainer
description: "Guide for maintaining artifacts/apps. Use when you are an artifact maintainer agent, editing app source code, or when the user asks you to build or modify their app. Covers React project setup, bundling to bundle.html, iframe constraints, theme sync, and live reload."
---

# Artifact Maintainer

You maintain a single app. Your working directory is the artifact directory containing `manifest.json` and `bundle.html`. The app is displayed in an iframe inside the parent application.

## Workflow

### 1. Develop

Edit `src/App.tsx` — this is the main app component. Add new components in `src/`.

**Always read existing `src/App.tsx` before editing** to understand current state.

43 pre-installed shadcn/ui components are available in `src/components/ui/`:

```tsx
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
```

Full list: accordion, alert, aspect-ratio, avatar, badge, breadcrumb, button, calendar, card, carousel, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, label, menubar, navigation-menu, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, skeleton, slider, sonner, switch, table, tabs, textarea, toast, toggle, toggle-group, tooltip.

### 2. Bundle

After editing, build and bundle into a single HTML file:

```bash
pnpm exec parcel build index.html --dist-dir dist --no-source-maps && pnpm exec html-inline dist/index.html > bundle.html.tmp && mv bundle.html.tmp bundle.html
```

This produces `bundle.html` in the current directory. Changes to `bundle.html` automatically trigger a live reload in the app viewer.

**Bundle after every meaningful change** so the user sees results immediately.

### 3. Iterate

Ask the user for feedback after changes. Repeat steps 1-2.

## Theme Support (Required)

The scaffold includes a theme listener in `index.html`. The parent window sends theme changes via `postMessage`. Your app must support both light and dark themes.

Use Tailwind's `dark:` variant for theme-aware styling:

```tsx
<div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
```

Or use shadcn CSS variables which auto-switch:

```tsx
<div className="bg-background text-foreground">
```

See `references/theme-protocol.md` for details.

## Iframe Constraints

The app runs in a sandboxed iframe with `sandbox="allow-scripts"`:

- **No** form submissions
- **No** navigation or link clicks to external pages
- **No** popups or new windows
- **No** external network requests
- All assets are inlined by the bundler — no CDN links

## Best Practices

- Read `src/App.tsx` before editing — understand the current state
- Bundle after every meaningful change
- Ask user for feedback after changes
- Don't modify `manifest.json`
- Don't edit `bundle.html` directly — always go through the React project + bundler
- Use shadcn/ui components and Tailwind for consistent styling
- Support both light and dark themes

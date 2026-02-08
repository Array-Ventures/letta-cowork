# Theme Protocol

## How It Works

The parent application sends theme changes to the artifact iframe via `postMessage`:

```js
iframe.contentWindow.postMessage({ type: "theme", value: "dark" }, "*")
// or
iframe.contentWindow.postMessage({ type: "theme", value: "light" }, "*")
```

The `index.html` (created by `init-project.sh`) includes a listener that toggles the `.dark` class on `<body>`:

```html
<script>
window.addEventListener("message", e => {
  if (e.data?.type === "theme")
    document.body.classList.toggle("dark", e.data.value === "dark")
})
</script>
```

## Tailwind Configuration

`darkMode: ["class"]` is pre-configured in `tailwind.config.js`. This means Tailwind's `dark:` variants activate when `.dark` is on any ancestor element.

## CSS Variables

`src/index.css` defines CSS variables for both `:root` (light) and `.dark` (dark) themes. These are synced with the parent app's design system. shadcn/ui components use these variables automatically.

Key tokens:
- `--background` — `#ffffff` (light) / `#1d1d1d` (dark)
- `--foreground` — `#141414` (light) / `#d6d6d6` (dark)
- `--primary` — deep blue `#0606ac` (light) / warm orange `#ff8a65` (dark)
- `--accent` — subtle indigo `#ebebf5` (light) / warm brown `#3d2f2b` (dark)
- `--muted-foreground` — `#8c8c8c` (light) / `#737373` (dark)
- `--border` — `#e8e8e8` (light) / `#2b2b2b` (dark)
- `--destructive` — `#c41952` (light) / `#ff6b6b` (dark)

## Usage Patterns

### shadcn CSS variables (auto-switch, preferred)

```tsx
<div className="bg-background text-foreground">
<p className="text-muted-foreground">
<div className="border border-border rounded-lg">
```

### Tailwind dark: variant (explicit control)

```tsx
<div className="bg-white dark:bg-gray-900">
<p className="text-gray-600 dark:text-gray-400">
```

### Mixed approach

```tsx
<Card>  {/* uses CSS variables automatically */}
  <CardContent>
    <span className="text-green-600 dark:text-green-400">Custom color</span>
  </CardContent>
</Card>
```

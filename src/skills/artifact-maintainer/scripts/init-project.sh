#!/bin/bash

# Exit on error
set -e

# Detect Node version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)

echo "Detected Node.js version: $NODE_VERSION"

if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Error: Node.js 18 or higher is required"
  echo "   Current version: $(node -v)"
  exit 1
fi

# Set Vite version based on Node version
if [ "$NODE_VERSION" -ge 20 ]; then
  VITE_VERSION="latest"
  echo "Using Vite latest (Node 20+)"
else
  VITE_VERSION="5.4.11"
  echo "Using Vite $VITE_VERSION (Node 18 compatible)"
fi

# Detect OS and set sed syntax
if [[ "$OSTYPE" == "darwin"* ]]; then
  SED_INPLACE="sed -i ''"
else
  SED_INPLACE="sed -i"
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
  echo "pnpm not found. Installing pnpm..."
  npm install -g pnpm
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPONENTS_TARBALL="$SCRIPT_DIR/shadcn-components.tar.gz"

# Check if components tarball exists
if [ ! -f "$COMPONENTS_TARBALL" ]; then
  echo "Error: shadcn-components.tar.gz not found in script directory"
  echo "   Expected location: $COMPONENTS_TARBALL"
  exit 1
fi

# In-place mode (no arg) vs named project mode
if [ -z "$1" ]; then
  echo "Scaffolding React project in current directory..."
  TEMP_DIR=".scaffold-temp"
  pnpm create vite "$TEMP_DIR" --template react-ts

  # Move scaffold files into cwd, preserving manifest.json and bundle.html
  shopt -s dotglob
  for item in "$TEMP_DIR"/*; do
    base=$(basename "$item")
    [ "$base" = "manifest.json" ] || [ "$base" = "bundle.html" ] && continue
    mv "$item" .
  done
  shopt -u dotglob
  rm -rf "$TEMP_DIR"
else
  PROJECT_NAME="$1"
  echo "Creating new React + Vite project: $PROJECT_NAME"
  pnpm create vite "$PROJECT_NAME" --template react-ts
  cd "$PROJECT_NAME"
fi

echo "Cleaning up Vite template..."
$SED_INPLACE '/<link rel="icon".*vite\.svg/d' index.html
$SED_INPLACE 's/<title>.*<\/title>/<title>App<\/title>/' index.html

echo "Installing base dependencies..."
pnpm install

# Pin Vite version for Node 18
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "Pinning Vite to $VITE_VERSION for Node 18 compatibility..."
  pnpm add -D vite@$VITE_VERSION
fi

echo "Installing Tailwind CSS and dependencies..."
pnpm install -D tailwindcss@3.4.1 postcss autoprefixer @types/node tailwindcss-animate
pnpm install class-variance-authority clsx tailwind-merge lucide-react next-themes

echo "Creating Tailwind and PostCSS configuration..."
cat > postcss.config.js << 'EOF'
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
EOF

echo "Configuring Tailwind with shadcn theme..."
cat > tailwind.config.js << 'EOF'
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
EOF

# Add Tailwind directives and CSS variables to index.css
echo "Adding Tailwind directives and CSS variables..."
cat > src/index.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 7.8%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 7.8%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 7.8%;
    --primary: 240 94.4% 34.9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 7.8%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 54.9%;
    --accent: 240 40% 94.1%;
    --accent-foreground: 240 94.4% 34.9%;
    --destructive: 342 76.9% 43.1%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 91%;
    --input: 0 0% 91%;
    --ring: 240 94.4% 34.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 0 0% 11.4%;
    --foreground: 0 0% 83.9%;
    --card: 0 0% 11.4%;
    --card-foreground: 0 0% 83.9%;
    --popover: 0 0% 11.4%;
    --popover-foreground: 0 0% 83.9%;
    --primary: 15 100% 69.8%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 12.9%;
    --secondary-foreground: 0 0% 83.9%;
    --muted: 0 0% 12.9%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 14 16.5% 20.4%;
    --accent-foreground: 15 100% 69.8%;
    --destructive: 0 100% 70.8%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 16.9%;
    --input: 0 0% 16.9%;
    --ring: 15 100% 69.8%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
EOF

# Add path aliases to tsconfig.json
echo "Adding path aliases to tsconfig.json..."
node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
config.compilerOptions = config.compilerOptions || {};
config.compilerOptions.baseUrl = '.';
config.compilerOptions.paths = { '@/*': ['./src/*'] };
fs.writeFileSync('tsconfig.json', JSON.stringify(config, null, 2));
"

# Add path aliases to tsconfig.app.json
echo "Adding path aliases to tsconfig.app.json..."
node -e "
const fs = require('fs');
const path = 'tsconfig.app.json';
const content = fs.readFileSync(path, 'utf8');
// Remove comments manually
const lines = content.split('\n').filter(line => !line.trim().startsWith('//'));
const jsonContent = lines.join('\n');
const config = JSON.parse(jsonContent.replace(/\/\*[\s\S]*?\*\//g, '').replace(/,(\s*[}\]])/g, '\$1'));
config.compilerOptions = config.compilerOptions || {};
config.compilerOptions.baseUrl = '.';
config.compilerOptions.paths = { '@/*': ['./src/*'] };
fs.writeFileSync(path, JSON.stringify(config, null, 2));
"

# Update vite.config.ts
echo "Updating Vite configuration..."
cat > vite.config.ts << 'EOF'
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
EOF

# Install all shadcn/ui dependencies
echo "Installing shadcn/ui dependencies..."
pnpm install @radix-ui/react-accordion @radix-ui/react-aspect-ratio @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-collapsible @radix-ui/react-context-menu @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-hover-card @radix-ui/react-label @radix-ui/react-menubar @radix-ui/react-navigation-menu @radix-ui/react-popover @radix-ui/react-progress @radix-ui/react-radio-group @radix-ui/react-scroll-area @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slider @radix-ui/react-slot @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-toast @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-tooltip
pnpm install sonner cmdk vaul embla-carousel-react react-day-picker react-resizable-panels date-fns react-hook-form @hookform/resolvers zod

# Extract shadcn components from tarball
echo "Extracting shadcn/ui components..."
tar -xzf "$COMPONENTS_TARBALL" -C src/

# Create components.json for reference
echo "Creating components.json config..."
cat > components.json << 'EOF'
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
EOF

# Add theme listener to index.html for iframe theme sync
echo "Adding theme listener to index.html..."
$SED_INPLACE 's|</body>|<script>window.addEventListener("message",e=>{if(e.data?.type==="theme")document.body.classList.toggle("dark",e.data.value==="dark")})</script>\n</body>|' index.html

# Replace default Vite App.tsx with artifact placeholder
echo "Creating artifact placeholder App.tsx..."
cat > src/App.tsx << 'APPEOF'
export default function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-semibold">Ready to build</h1>
        <p className="text-sm text-muted-foreground">
          Tell your maintainer agent what to create.
        </p>
      </div>
    </div>
  )
}
APPEOF

# Clean up unnecessary Vite default files
rm -f src/App.css src/assets/react.svg public/vite.svg

echo ""
echo "Setup complete! React + Tailwind + shadcn/ui project ready."
echo ""
echo "43 shadcn/ui components available in src/components/ui/"
echo ""
echo "Import components like:"
echo "  import { Button } from '@/components/ui/button'"
echo "  import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'"
echo "  import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'"
echo ""
echo "Run 'bash scripts/bundle.sh' to produce bundle.html"

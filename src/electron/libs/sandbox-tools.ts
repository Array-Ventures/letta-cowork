/**
 * Python tool source code for Daytona sandbox operations.
 * These tools replicate the letta-code-sdk built-in tools (Bash, Read, Write, Glob, Grep, Edit)
 * so cloud agents have the same tool interface as local agents.
 * They use the Daytona Python SDK to interact with the sandbox.
 * Agent secrets (SANDBOX_ID, DAYTONA_API_KEY) route to the correct sandbox.
 */

import { getLettaClient } from "./letta-client.js";
import { createLogger } from "./logger.js";

const log = createLogger("sandbox-tools");

// pip dependency for all sandbox tools
const PIP_REQUIREMENTS = [{ name: "daytona_sdk" }];

// --- Python tool source code ---

const BASH_SOURCE = `
def Bash(command: str, timeout: int = 120, description: str = "") -> str:
    """Executes a given bash command in the sandbox with optional timeout.

    Args:
        command: The command to execute
        timeout: Optional timeout in seconds (default 120, max 600)
        description: Clear, concise description of what this command does

    Returns:
        Command output with exit code
    """
    import os
    from daytona_sdk import Daytona, DaytonaConfig

    api_key = os.getenv("DAYTONA_API_KEY")
    sandbox_id = os.getenv("SANDBOX_ID")
    api_url = os.getenv("DAYTONA_API_URL")

    if not all([api_key, sandbox_id]):
        return "Error: Sandbox not configured. Missing DAYTONA_API_KEY or SANDBOX_ID."

    try:
        cfg = DaytonaConfig(api_key=api_key, api_url=api_url) if api_url else DaytonaConfig(api_key=api_key)
        daytona = Daytona(cfg)
        sandbox = daytona.get(sandbox_id)
        if timeout > 600:
            timeout = 600
        response = sandbox.process.exec(command, timeout=timeout)
        exit_code = response.exit_code
        result = response.result or ""
        return f"[exit {exit_code}]\\n{result}"
    except Exception as e:
        return f"Error running command: {e}"
`;

const READ_SOURCE = `
def Read(file_path: str, offset: int = 0, limit: int = 2000) -> str:
    """Reads a file from the sandbox filesystem.

    Args:
        file_path: The absolute path to the file to read
        offset: The line number to start reading from (1-based). Only provide if the file is too large to read at once
        limit: The number of lines to read. Only provide if the file is too large to read at once

    Returns:
        File contents with line numbers
    """
    import os
    from daytona_sdk import Daytona, DaytonaConfig

    api_key = os.getenv("DAYTONA_API_KEY")
    sandbox_id = os.getenv("SANDBOX_ID")
    api_url = os.getenv("DAYTONA_API_URL")

    if not all([api_key, sandbox_id]):
        return "Error: Sandbox not configured."

    try:
        cfg = DaytonaConfig(api_key=api_key, api_url=api_url) if api_url else DaytonaConfig(api_key=api_key)
        daytona = Daytona(cfg)
        sandbox = daytona.get(sandbox_id)
        content = sandbox.fs.download_file(file_path)
        text = content.decode("utf-8") if isinstance(content, bytes) else str(content)
        lines = text.splitlines()

        # Apply offset (1-based) and limit
        start = max(0, offset - 1) if offset > 0 else 0
        end = start + limit if limit > 0 else len(lines)
        selected = lines[start:end]

        # Format with line numbers (cat -n style)
        numbered = []
        for i, line in enumerate(selected, start=start + 1):
            numbered.append(f"{i:>6}\\t{line}")
        return "\\n".join(numbered) if numbered else "(empty file)"
    except Exception as e:
        return f"Error reading {file_path}: {e}"
`;

const WRITE_SOURCE = `
def Write(file_path: str, content: str) -> str:
    """Writes a file to the sandbox filesystem. This will overwrite the existing file if there is one.

    Args:
        file_path: The absolute path to the file to write (must be absolute, not relative)
        content: The content to write to the file

    Returns:
        Confirmation message
    """
    import os
    from daytona_sdk import Daytona, DaytonaConfig

    api_key = os.getenv("DAYTONA_API_KEY")
    sandbox_id = os.getenv("SANDBOX_ID")
    api_url = os.getenv("DAYTONA_API_URL")

    if not all([api_key, sandbox_id]):
        return "Error: Sandbox not configured."

    try:
        cfg = DaytonaConfig(api_key=api_key, api_url=api_url) if api_url else DaytonaConfig(api_key=api_key)
        daytona = Daytona(cfg)
        sandbox = daytona.get(sandbox_id)
        # Ensure parent directory exists
        parent = os.path.dirname(file_path)
        if parent and parent != "/":
            sandbox.process.exec(f"mkdir -p {parent}")
        sandbox.fs.upload_file(content.encode("utf-8"), file_path)
        return f"Written {len(content)} chars to {file_path}"
    except Exception as e:
        return f"Error writing {file_path}: {e}"
`;

const GLOB_SOURCE = `
def Glob(pattern: str, path: str = "") -> str:
    """Fast file pattern matching tool. Supports glob patterns like "**/*.js" or "src/**/*.ts".
    Returns matching file paths sorted by modification time.

    Args:
        pattern: The glob pattern to match files against
        path: The directory to search in. Defaults to /home/daytona if not specified

    Returns:
        Matching file paths, one per line
    """
    import os
    from daytona_sdk import Daytona, DaytonaConfig

    api_key = os.getenv("DAYTONA_API_KEY")
    sandbox_id = os.getenv("SANDBOX_ID")
    api_url = os.getenv("DAYTONA_API_URL")

    if not all([api_key, sandbox_id]):
        return "Error: Sandbox not configured."

    try:
        cfg = DaytonaConfig(api_key=api_key, api_url=api_url) if api_url else DaytonaConfig(api_key=api_key)
        daytona = Daytona(cfg)
        sandbox = daytona.get(sandbox_id)
        search_path = path if path else "/home/daytona"
        # Use find with -name for simple patterns, or shell globbing for ** patterns
        if "**" in pattern:
            # Use bash globstar for recursive glob
            cmd = f"bash -c 'shopt -s globstar nullglob; cd {search_path} && printf \\"%s\\\\n\\" {pattern} | head -500'"
        else:
            cmd = f"find {search_path} -name '{pattern}' -not -path '*/node_modules/*' -not -path '*/.git/*' | head -500"
        response = sandbox.process.exec(cmd, timeout=30)
        result = response.result or ""
        return result.strip() if result.strip() else "(no matches)"
    except Exception as e:
        return f"Error: {e}"
`;

const GREP_SOURCE = `
def Grep(pattern: str, path: str = "", include: str = "", output_mode: str = "files_with_matches", context_before: int = 0, context_after: int = 0, case_insensitive: bool = False) -> str:
    """Search file contents using regex patterns. Supports filtering by file pattern and multiple output modes.

    Args:
        pattern: The regular expression pattern to search for in file contents
        path: File or directory to search in. Defaults to /home/daytona
        include: Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}")
        output_mode: "files_with_matches" shows file paths, "content" shows matching lines, "count" shows match counts
        context_before: Number of lines to show before each match (only for content mode)
        context_after: Number of lines to show after each match (only for content mode)
        case_insensitive: Case insensitive search

    Returns:
        Search results based on output_mode
    """
    import os
    from daytona_sdk import Daytona, DaytonaConfig

    api_key = os.getenv("DAYTONA_API_KEY")
    sandbox_id = os.getenv("SANDBOX_ID")
    api_url = os.getenv("DAYTONA_API_URL")

    if not all([api_key, sandbox_id]):
        return "Error: Sandbox not configured."

    try:
        cfg = DaytonaConfig(api_key=api_key, api_url=api_url) if api_url else DaytonaConfig(api_key=api_key)
        daytona = Daytona(cfg)
        sandbox = daytona.get(sandbox_id)
        search_path = path if path else "/home/daytona"

        # Build grep command
        cmd_parts = ["grep", "-r", "-n"]

        if output_mode == "files_with_matches":
            cmd_parts.append("-l")
        elif output_mode == "count":
            cmd_parts.append("-c")

        if case_insensitive:
            cmd_parts.append("-i")

        if context_before > 0 and output_mode == "content":
            cmd_parts.append(f"-B {context_before}")
        if context_after > 0 and output_mode == "content":
            cmd_parts.append(f"-A {context_after}")

        if include:
            cmd_parts.append(f"--include='{include}'")

        # Exclude common noisy directories
        cmd_parts.append("--exclude-dir=node_modules")
        cmd_parts.append("--exclude-dir=.git")

        cmd_parts.append(f"'{pattern}'")
        cmd_parts.append(search_path)
        cmd_parts.append("| head -500")

        cmd = " ".join(cmd_parts)
        response = sandbox.process.exec(cmd, timeout=30)
        result = response.result or ""

        if output_mode == "count":
            # Filter out zero-count lines
            lines = [l for l in result.strip().splitlines() if not l.endswith(":0")]
            return "\\n".join(lines) if lines else "(no matches)"

        return result.strip() if result.strip() else "(no matches)"
    except Exception as e:
        return f"Error: {e}"
`;

const EDIT_SOURCE = `
def Edit(file_path: str, old_string: str, new_string: str, replace_all: bool = False) -> str:
    """Performs exact string replacements in files. The old_string must be unique in the file unless replace_all is True.

    Args:
        file_path: The absolute path to the file to modify
        old_string: The text to replace
        new_string: The text to replace it with (must be different from old_string)
        replace_all: Replace all occurrences of old_string (default False)

    Returns:
        Confirmation message or error
    """
    import os
    from daytona_sdk import Daytona, DaytonaConfig

    api_key = os.getenv("DAYTONA_API_KEY")
    sandbox_id = os.getenv("SANDBOX_ID")
    api_url = os.getenv("DAYTONA_API_URL")

    if not all([api_key, sandbox_id]):
        return "Error: Sandbox not configured."

    if old_string == new_string:
        return "Error: old_string and new_string must be different."

    try:
        cfg = DaytonaConfig(api_key=api_key, api_url=api_url) if api_url else DaytonaConfig(api_key=api_key)
        daytona = Daytona(cfg)
        sandbox = daytona.get(sandbox_id)

        # Read current file content
        content_bytes = sandbox.fs.download_file(file_path)
        content = content_bytes.decode("utf-8") if isinstance(content_bytes, bytes) else str(content_bytes)

        # Check that old_string exists
        count = content.count(old_string)
        if count == 0:
            return f"Error: old_string not found in {file_path}"

        if count > 1 and not replace_all:
            return f"Error: old_string appears {count} times in {file_path}. Use replace_all=True to replace all occurrences, or provide a larger unique string."

        # Perform replacement
        if replace_all:
            new_content = content.replace(old_string, new_string)
        else:
            new_content = content.replace(old_string, new_string, 1)

        # Write back
        sandbox.fs.upload_file(new_content.encode("utf-8"), file_path)
        replacements = count if replace_all else 1
        return f"Replaced {replacements} occurrence(s) in {file_path}"
    except Exception as e:
        return f"Error editing {file_path}: {e}"
`;

// --- Tool name -> source mapping ---

const TOOL_DEFINITIONS = [
  { name: "Bash", source: BASH_SOURCE },
  { name: "Read", source: READ_SOURCE },
  { name: "Write", source: WRITE_SOURCE },
  { name: "Glob", source: GLOB_SOURCE },
  { name: "Grep", source: GREP_SOURCE },
  { name: "Edit", source: EDIT_SOURCE },
] as const;

// Cache tool IDs so we only register once per app lifecycle
let cachedToolIds: string[] | null = null;

/**
 * Ensure sandbox tools are registered on the Letta server.
 * Returns tool IDs. Creates tools if they don't exist, reuses if they do.
 */
export async function ensureSandboxTools(): Promise<string[]> {
  if (cachedToolIds) return cachedToolIds;

  const client = getLettaClient();
  const existingPage = await client.tools.list();
  const existingTools = existingPage.items;

  const toolIds: string[] = [];

  for (const def of TOOL_DEFINITIONS) {
    // Check if tool already exists by name
    const existing = existingTools.find((t) => t.name === def.name);
    if (existing) {
      // Update source code in case it changed
      await client.tools.update(existing.id, { source_code: def.source, pip_requirements: PIP_REQUIREMENTS });
      log.debug(`Tool "${def.name}" updated: ${existing.id}`);
      toolIds.push(existing.id);
      continue;
    }

    // Create new tool
    const tool = await client.tools.create({ source_code: def.source, pip_requirements: PIP_REQUIREMENTS });
    log.info(`Registered tool "${def.name}": ${tool.id}`);
    toolIds.push(tool.id);
  }

  cachedToolIds = toolIds;
  return toolIds;
}

/**
 * Attach sandbox tools to an agent and set its secrets for sandbox routing.
 */
export async function attachSandboxToolsToAgent(
  agentId: string,
  sandboxId: string,
): Promise<void> {
  const client = getLettaClient();
  const toolIds = await ensureSandboxTools();

  // Attach each tool to the agent
  for (const toolId of toolIds) {
    await client.agents.tools.attach(toolId, { agent_id: agentId });
  }
  log.info(`Attached ${toolIds.length} sandbox tools to agent ${agentId}`);

  // Set agent secrets for sandbox routing
  const secrets: Record<string, string> = {
    DAYTONA_API_KEY: process.env.DAYTONA_API_KEY!,
    SANDBOX_ID: sandboxId,
  };
  if (process.env.DAYTONA_API_URL) {
    secrets.DAYTONA_API_URL = process.env.DAYTONA_API_URL;
  }
  await client.agents.update(agentId, { secrets });
  log.info(`Set sandbox secrets for agent ${agentId} (sandbox: ${sandboxId})`);
}

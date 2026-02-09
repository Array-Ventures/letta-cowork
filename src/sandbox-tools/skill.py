def Skill(command: str, skills: list = None) -> str:
    """Load or unload skills into the agent's memory.

    When users ask you to perform tasks, check if any of the available skills can help
    complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

    Use command "load" with a list of skill IDs to load skills.
    Use command "unload" with a list of skill IDs to unload skills.
    Use command "refresh" to re-scan the skills directory and update the available skills list.

    Args:
        command: The operation to perform: "load" to load skills, "unload" to unload skills, "refresh" to re-scan the skills directory and update the available skills list
        skills: List of skill IDs to load or unload (required for load/unload, not used for refresh)

    Returns:
        Status message
    """
    import os
    import re
    from daytona_sdk import Daytona, DaytonaConfig
    from letta_client import Letta

    api_key = os.getenv("DAYTONA_API_KEY")
    sandbox_id = os.getenv("SANDBOX_ID")
    api_url = os.getenv("DAYTONA_API_URL")
    agent_id = os.getenv("LETTA_AGENT_ID")

    # Construct Letta client manually (auto-injected `client` is None on self-hosted Docker)
    letta_base_url = os.getenv("LETTA_BASE_URL") or "http://localhost:8283"
    letta_api_key = os.getenv("LETTA_API_KEY") or ""
    letta = Letta(base_url=letta_base_url, api_key=letta_api_key) if letta_api_key else Letta(base_url=letta_base_url)

    if skills is None:
        skills = []

    if not all([api_key, sandbox_id]):
        return "Error: Sandbox not configured. Missing DAYTONA_API_KEY or SANDBOX_ID."

    if command not in ("load", "unload", "refresh"):
        return f'Error: Invalid command "{command}". Must be "load", "unload", or "refresh".'

    if command != "refresh" and not skills:
        return f'Error: skills parameter is required for "{command}" command.'

    try:
        # Connect to sandbox for filesystem access
        cfg = DaytonaConfig(api_key=api_key, api_url=api_url) if api_url else DaytonaConfig(api_key=api_key)
        daytona = Daytona(cfg)
        sandbox = daytona.get(sandbox_id)

        skills_base = "/home/daytona/.skills"

        if command == "refresh":
            # Re-scan sandbox filesystem and update skills block
            response = sandbox.process.exec(f"ls {skills_base}", timeout=10)
            dirs = [d.strip() for d in (response.result or "").strip().splitlines() if d.strip()]

            if not dirs:
                formatted = f"Skills Directory: {skills_base}\n\n[NO SKILLS AVAILABLE]"
            else:
                parts = [f"Skills Directory: {skills_base}\n\nAvailable Skills:\n"]
                for skill_dir in dirs:
                    skill_path = f"{skills_base}/{skill_dir}/SKILL.md"
                    try:
                        content_bytes = sandbox.fs.download_file(skill_path)
                        text = content_bytes.decode("utf-8") if isinstance(content_bytes, bytes) else str(content_bytes)
                        # Parse YAML frontmatter
                        fm_match = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
                        name = skill_dir
                        description = "No description available"
                        if fm_match:
                            fm = fm_match.group(1)
                            name_m = re.search(r"^name:\s*(.+)$", fm, re.MULTILINE)
                            desc_m = re.search(r'^description:\s*["\']?(.+?)["\']?\s*$', fm, re.MULTILINE)
                            if name_m:
                                name = name_m.group(1).strip().strip("\"'")
                            if desc_m:
                                description = desc_m.group(1).strip()
                        parts.append(f"\n### {name} (bundled)\nID: `{skill_dir}`\nDescription: {description}\n")
                    except Exception:
                        parts.append(f"\n### {skill_dir} (bundled)\nID: `{skill_dir}`\nDescription: (could not read SKILL.md)\n")
                formatted = "".join(parts)

            # Update skills block via manually constructed client
            letta.agents.blocks.update("skills", agent_id=agent_id, value=formatted.strip())
            return (
                "The core memory block with label `skills` has been successfully edited. "
                "Your system prompt has been recompiled with the updated memory contents and is now active in your context. "
                "Review the changes and make sure they are as expected (correct indentation, no duplicate lines, etc). "
                f"Edit the memory block again if necessary. Found {len(dirs)} skill(s)."
            )

        if command == "load":
            # Get current loaded_skills block
            block = letta.agents.blocks.retrieve("loaded_skills", agent_id=agent_id)
            current_value = (block.value or "").strip()

            loaded = []
            already_loaded = []
            failed = []

            for skill_id in skills:
                # Check if already loaded
                if re.search(rf"# Skill: {re.escape(skill_id)}\b", current_value):
                    already_loaded.append(skill_id)
                    continue

                # Read SKILL.md from sandbox
                skill_path = f"{skills_base}/{skill_id}/SKILL.md"
                try:
                    content_bytes = sandbox.fs.download_file(skill_path)
                    skill_content = content_bytes.decode("utf-8") if isinstance(content_bytes, bytes) else str(content_bytes)
                except Exception as e:
                    failed.append(f"{skill_id} ({e})")
                    continue

                # Append to loaded_skills block
                if current_value in ("No skills currently loaded.", "[CURRENTLY EMPTY]"):
                    current_value = ""

                separator = "\n\n---\n\n" if current_value else ""
                current_value = f"{current_value}{separator}# Skill: {skill_id}\n{skill_content}"
                loaded.append(skill_id)

            if loaded:
                letta.agents.blocks.update("loaded_skills", agent_id=agent_id, value=current_value)

            parts = []
            if loaded:
                parts.append(
                    "The core memory block with label `loaded_skills` has been successfully edited. "
                    "Your system prompt has been recompiled with the updated memory contents and is now active in your context. "
                    "Review the changes and make sure they are as expected (correct indentation, no duplicate lines, etc). "
                    "Edit the memory block again if necessary."
                )
                parts.append(f"Loaded: {', '.join(loaded)}.")
            if already_loaded:
                parts.append(f"Already loaded: {', '.join(already_loaded)}.")
            if failed:
                parts.append(f"Failed: {', '.join(failed)}.")
            if not loaded and not already_loaded:
                parts.append("No skills were loaded.")
            parts.append("Review your `loaded_skills` block for instructions and unload skills when done to free up context.")
            return " ".join(parts)

        if command == "unload":
            # Get current loaded_skills block
            block = letta.agents.blocks.retrieve("loaded_skills", agent_id=agent_id)
            current_value = (block.value or "").strip()

            unloaded = []
            not_loaded = []

            for skill_id in skills:
                pattern = rf"# Skill: {re.escape(skill_id)}\b"
                if not re.search(pattern, current_value):
                    not_loaded.append(skill_id)
                    continue

                # Find all skill headers to determine boundaries
                headers = list(re.finditer(r"# Skill: ([^\n]+)", current_value))
                target_idx = None
                for i, h in enumerate(headers):
                    if h.group(1).strip() == skill_id:
                        target_idx = i
                        break

                if target_idx is None:
                    not_loaded.append(skill_id)
                    continue

                start = headers[target_idx].start()
                if target_idx + 1 < len(headers):
                    # Find separator before next skill
                    end = headers[target_idx + 1].start()
                    # Remove preceding separator if present
                    sep = "\n\n---\n\n"
                    before_next = current_value[max(0, end - len(sep)):end]
                    if before_next == sep:
                        end = end - len(sep)
                else:
                    end = len(current_value)

                # Remove preceding separator if this isn't the first skill
                if start > 0:
                    sep = "\n\n---\n\n"
                    if current_value[max(0, start - len(sep)):start] == sep:
                        start = start - len(sep)

                current_value = current_value[:start] + current_value[end:]
                unloaded.append(skill_id)

            current_value = current_value.strip()
            if not current_value:
                current_value = "No skills currently loaded."

            letta.agents.blocks.update("loaded_skills", agent_id=agent_id, value=current_value)

            parts = [
                "The core memory block with label `loaded_skills` has been successfully edited. "
                "Your system prompt has been recompiled with the updated memory contents and is now active in your context. "
                "Review the changes and make sure they are as expected (correct indentation, no duplicate lines, etc). "
                "Edit the memory block again if necessary."
            ]
            if unloaded:
                parts.append(f"Unloaded: {', '.join(unloaded)}.")
            if not_loaded:
                parts.append(f"Not loaded (skipped): {', '.join(not_loaded)}.")
            if not unloaded:
                parts.append("No skills were unloaded.")
            return " ".join(parts)

    except Exception as e:
        return f"Error in Skill tool: {e}"

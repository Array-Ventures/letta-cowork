def Read(file_path: str, offset: int = 0, limit: int = 2000) -> str:
    """Reads a file from the sandbox filesystem.

    Args:
        file_path: The absolute path to the file to read
        offset: The line number to start reading from. Only provide if the file is too large to read at once
        limit: The number of lines to read. Only provide if the file is too large to read at once.

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
            numbered.append(f"{i:>6}\t{line}")
        return "\n".join(numbered) if numbered else "(empty file)"
    except Exception as e:
        return f"Error reading {file_path}: {e}"

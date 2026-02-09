def Glob(pattern: str, path: str = "") -> str:
    """Fast file pattern matching tool. Supports glob patterns like "**/*.js" or "src/**/*.ts".
    Returns matching file paths sorted by modification time.

    Args:
        pattern: The glob pattern to match files against
        path: The directory to search in. Defaults to /home/daytona if not specified.

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
        if "**" in pattern:
            cmd = f"bash -c 'shopt -s globstar nullglob; cd {search_path} && printf \"%s\\n\" {pattern} | head -500'"
        else:
            cmd = f"find {search_path} -name '{pattern}' -not -path '*/node_modules/*' -not -path '*/.git/*' | head -500"
        response = sandbox.process.exec(cmd, timeout=30)
        result = response.result or ""
        return result.strip() if result.strip() else "(no matches)"
    except Exception as e:
        return f"Error: {e}"

def Grep(
    pattern: str,
    path: str = "",
    glob: str = "",
    output_mode: str = "files_with_matches",
    before: int = 0,
    after: int = 0,
    context: int = 0,
    ignore_case: bool = False,
    line_numbers: bool = True,
    type: str = "",
    head_limit: int = 100,
    offset: int = 0,
    multiline: bool = False,
) -> str:
    """A powerful search tool built on ripgrep.

    Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+").
    Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust").
    Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts.

    Args:
        pattern: The regular expression pattern to search for in file contents
        path: File or directory to search in (rg PATH). Defaults to /home/daytona.
        glob: Glob pattern to filter files (e.g. "*.js", "*.{ts,tsx}") - maps to rg --glob
        output_mode: Output mode: "content", "files_with_matches" (default), or "count"
        before: Number of lines to show before each match (rg -B). Requires output_mode: "content".
        after: Number of lines to show after each match (rg -A). Requires output_mode: "content".
        context: Number of lines to show before and after each match (rg -C). Requires output_mode: "content".
        ignore_case: Case insensitive search (rg -i)
        line_numbers: Show line numbers in output (rg -n). Defaults to true.
        type: File type to search (rg --type). Common types: js, py, rust, go, java, etc.
        head_limit: Limit output to first N lines/entries. Defaults to 100 (0 = unlimited).
        offset: Skip first N lines/entries before applying head_limit. Defaults to 0.
        multiline: Enable multiline mode (rg -U --multiline-dotall). Default: false.

    Returns:
        Search results based on output_mode
    """
    import os
    import shlex
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
        args = ["rg"]

        if output_mode == "files_with_matches":
            args.append("-l")
        elif output_mode == "count":
            args.append("-c")

        if output_mode == "content":
            if line_numbers:
                args.append("-n")
            if before > 0:
                args.extend(["-B", str(before)])
            if after > 0:
                args.extend(["-A", str(after)])
            if context > 0:
                args.extend(["-C", str(context)])

        if ignore_case:
            args.append("-i")
        if multiline:
            args.extend(["-U", "--multiline-dotall"])
        if glob:
            args.extend(["--glob", glob])
        if type:
            args.extend(["--type", type])

        args.append("--")
        args.append(pattern)
        args.append(search_path)

        cmd = " ".join(shlex.quote(a) for a in args)
        response = sandbox.process.exec(cmd, timeout=30)
        result = response.result or ""
        lines = result.strip().split("\n") if result.strip() else []

        # Apply offset and head_limit
        if offset > 0:
            lines = lines[offset:]
        if head_limit > 0:
            lines = lines[:head_limit]

        output = "\n".join(lines)
        return output if output else "(no matches)"
    except Exception as e:
        return f"Error: {e}"


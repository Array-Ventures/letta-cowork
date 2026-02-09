def Bash(command: str, timeout: int = 120000, description: str = "") -> str:
    """Executes a given bash command in the sandbox with optional timeout.

    Args:
        command: The command to execute
        timeout: Optional timeout in milliseconds (max 600000)
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
        # Convert ms to seconds for Daytona SDK, cap at 600s
        timeout_sec = min(timeout // 1000, 600) if timeout > 0 else 120
        response = sandbox.process.exec(command, timeout=timeout_sec)
        exit_code = response.exit_code
        result = response.result or ""
        return f"[exit {exit_code}]\n{result}"
    except Exception as e:
        return f"Error running command: {e}"

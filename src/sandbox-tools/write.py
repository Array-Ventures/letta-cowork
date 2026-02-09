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
        parent = os.path.dirname(file_path)
        if parent and parent != "/":
            sandbox.process.exec(f"mkdir -p {parent}")
        sandbox.fs.upload_file(content.encode("utf-8"), file_path)
        return f"Written {len(content)} chars to {file_path}"
    except Exception as e:
        return f"Error writing {file_path}: {e}"

def Edit(file_path: str, old_string: str, new_string: str, replace_all: bool = False) -> str:
    """Performs exact string replacements in files.

    The edit will fail if old_string is not unique in the file unless replace_all is true.
    Use replace_all for replacing and renaming strings across the file.

    Args:
        file_path: The absolute path to the file to modify
        old_string: The text to replace
        new_string: The text to replace it with (must be different from old_string)
        replace_all: Replace all occurrences of old_string (default false)

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

        if old_string not in content:
            return f"Error: old_string not found in {file_path}"

        if not replace_all:
            count = content.count(old_string)
            if count > 1:
                return f"Error: old_string appears {count} times in {file_path}. Use replace_all=true or provide more context to make it unique."
            new_content = content.replace(old_string, new_string, 1)
        else:
            new_content = content.replace(old_string, new_string)

        # Write back
        sandbox.fs.upload_file(new_content.encode("utf-8"), file_path)
        replacements = content.count(old_string)
        return f"Edited {file_path}: replaced {replacements} occurrence(s)"
    except Exception as e:
        return f"Error editing {file_path}: {e}"

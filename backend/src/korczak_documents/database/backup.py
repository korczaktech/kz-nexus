from pathlib import Path
import subprocess


def create_backup(uri: str, database: str, output_dir: str) -> str:
    path = Path(output_dir)
    path.mkdir(parents=True, exist_ok=True)
    archive = path / f"{database}.archive"
    subprocess.run(
        [
            "mongodump",
            f"--uri={uri}",
            f"--db={database}",
            f"--archive={archive}",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    if not archive.is_file() or archive.stat().st_size == 0:
        raise RuntimeError("mongodump não produziu um arquivo de backup válido")
    return str(archive)


def restore_backup(uri: str, database: str, backup_path: str) -> None:
    archive = Path(backup_path)
    if archive.suffix != ".archive" or not archive.is_file():
        raise ValueError("O caminho do backup deve apontar para um arquivo .archive válido")
    subprocess.run(
        [
            "mongorestore",
            f"--uri={uri}",
            "--drop",
            f"--nsInclude={database}.*",
            f"--archive={archive}",
        ],
        check=True,
        capture_output=True,
        text=True,
    )

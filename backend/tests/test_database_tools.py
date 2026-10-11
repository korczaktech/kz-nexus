from pathlib import Path
from unittest.mock import patch

from korczak_documents.database.backup import create_backup, restore_backup


def test_backup_invokes_mongodump(tmp_path: Path) -> None:
    archive = tmp_path / "KZDocs.archive"
    archive.write_bytes(b"backup")
    with patch("subprocess.run") as run:
        run.return_value.returncode = 0
        result = create_backup("mongodb://localhost:27017", "KZDocs", str(tmp_path))
        assert result == str(archive)
        assert run.call_args.args[0][0] == "mongodump"
        assert "--db=KZDocs" in run.call_args.args[0]
        assert f"--archive={archive}" in run.call_args.args[0]


def test_restore_invokes_mongorestore(tmp_path: Path) -> None:
    archive = tmp_path / "KZDocs.archive"
    archive.write_bytes(b"backup")
    with patch("subprocess.run") as run:
        run.return_value.returncode = 0
        restore_backup("mongodb://localhost:27017", "KZDocs", str(archive))
        assert run.call_args.args[0][0] == "mongorestore"
        assert "--drop" in run.call_args.args[0]
        assert "--nsInclude=KZDocs.*" in run.call_args.args[0]
        assert f"--archive={archive}" in run.call_args.args[0]


def test_restore_rejects_invalid_backup() -> None:
    with patch("subprocess.run") as run:
        try:
            restore_backup("mongodb://localhost:27017", "KZDocs", "/tmp/backup")
        except ValueError:
            pass
        else:
            raise AssertionError("restore deveria rejeitar backup inválido")
        run.assert_not_called()

import os

from cryptography.fernet import Fernet, InvalidToken


_fernet = Fernet(os.environ['DATA_ENCRYPTION_KEY'].encode())


def encrypt_secret(value: str) -> str:
    if not value or value.startswith('enc:'):
        return value
    return 'enc:' + _fernet.encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    if not value:
        return ''
    if not value.startswith('enc:'):
        return value
    try:
        return _fernet.decrypt(value[4:].encode()).decode()
    except InvalidToken as exc:
        raise RuntimeError('Stored secret cannot be decrypted with the configured key.') from exc


def encrypt_bytes(value: bytes) -> bytes:
    return _fernet.encrypt(value)


def decrypt_bytes(value: bytes) -> bytes:
    return _fernet.decrypt(value)
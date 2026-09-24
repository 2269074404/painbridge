from datetime import datetime, timezone


def now() -> datetime:
    return datetime.now(timezone.utc)


def ser(doc: dict | None) -> dict | None:
    """Mongo doc -> JSON-friendly dict with `id` instead of `_id`."""
    if doc is None:
        return None
    out = {}
    for k, v in doc.items():
        if k == "_id":
            out["id"] = str(v)
        elif k == "passwordHash":
            continue
        elif hasattr(v, "binary") and hasattr(v, "generation_time"):  # ObjectId
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def public_user(u: dict) -> dict:
    return {
        "id": str(u["_id"]),
        "email": u["email"],
        "role": u["role"],
        "legalName": u.get("legalName", ""),
    }

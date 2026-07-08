from typing import Annotated

from fastapi import Header


UserIdHeader = Annotated[int | None, Header(alias="X-User-Id")]
UserNameHeader = Annotated[str | None, Header(alias="X-User-Name")]


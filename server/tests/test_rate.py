import pytest
from fastapi import HTTPException
from app import main


def test_rate_limit_window():
    main._hits.clear()
    for _ in range(main.RATE_LIMIT):
        main.check_rate("1.2.3.4")
    with pytest.raises(HTTPException) as e:
        main.check_rate("1.2.3.4")
    assert e.value.status_code == 429
    main.check_rate("5.6.7.8")  # other ip unaffected

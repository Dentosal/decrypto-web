from typing import Callable
import pytest

from .player import StrategyInput, run_game


def strategy_always_right(input: StrategyInput) -> bool:
    return True  # Guess correctly


def strategy_guess_right_never_intercept(input: StrategyInput) -> bool:
    if input.situation == "intercept":
        return False  # Intercept incorrectly
    elif input.situation == "guess":
        return True  # Guess correctly
    else:
        raise ValueError(f"Unexpected situation: {input.situation}")


def mk_strategy_one_always_right_other_wrong(
    winning_team: int,
) -> Callable[[StrategyInput], bool]:
    def inner(input: StrategyInput) -> bool:
        return input.team == winning_team

    return inner


@pytest.mark.parametrize(
    "strategy,expected",
    [
        (strategy_always_right, None),
        (strategy_guess_right_never_intercept, None),
        (mk_strategy_one_always_right_other_wrong(0), 0),
        (mk_strategy_one_always_right_other_wrong(1), 1),
    ],
)
def test_happy_path(strategy, expected):
    assert run_game(strategy) == expected

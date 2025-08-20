import pytest
import threading

from .session import GameServer
from .player import StrategyInput, simple_player, SharedState


def run_game(strategy, count=4):
    assert count >= 4, "At least one four players are required"
    shared = SharedState()
    with GameServer() as port:
        ts = [threading.Thread(target=simple_player, args=(i, port, shared, strategy)) for i in range(count)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
    
    results = shared.results 
    if results[0] == "draw":
        return None
    elif results[0] == "win":
        return 0
    elif results[0] == "loss":
        return 1
    else:
        raise ValueError(f"Unexpected game result: {results}")

def strategy_always_right(input: StrategyInput) -> bool:
    return True  # Guess correctly

def strategy_guess_right_never_intercept(input: StrategyInput) -> bool:
    if input.situation == "intercept":
        return False  # Intercept incorrectly
    elif input.situation == "guess":
        return True  # Guess correctly
    else:
        raise ValueError(f"Unexpected situation: {input.situation}")

def mk_strategy_one_always_right_other_wrong(winning_team: bool) -> bool:
    def inner(input: StrategyInput) -> bool:
        return input.team == winning_team
    return inner

@pytest.mark.parametrize("strategy,expected", [
    (strategy_always_right, None),
    (strategy_guess_right_never_intercept, None),
    (mk_strategy_one_always_right_other_wrong(0), 0),
    (mk_strategy_one_always_right_other_wrong(1), 1),
])
def test_happy_path(strategy, expected):
    assert run_game(strategy) == expected

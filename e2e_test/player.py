from typing import Callable, Optional
from dataclasses import dataclass
import time
import threading

from .session import new_isolated_firefox

from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.common.exceptions import (
    NoSuchElementException,
    StaleElementReferenceException,
)


class SharedState:
    def __init__(self):
        self.stop_event = threading.Event()
        self.invite_link = None
        self.results = {}
        self.first_error = None


def set_nick_if_needed(driver, index: int):
    try:
        root = driver.find_element(By.CSS_SELECTOR, "nickname-input")
    except NoSuchElementException:
        return
    el = root.shadow_root.find_element(By.CSS_SELECTOR, "input")
    if el.get_attribute("value") == "":
        el.send_keys(f"client {index}")
        time.sleep(0.2)
        el.send_keys(Keys.ENTER)
    time.sleep(0.1)


def create_lobby_if_needed(driver):
    try:
        el = driver.find_element(By.CSS_SELECTOR, "input#create-lobby")
    except NoSuchElementException:
        return None
    el.click()
    time.sleep(0.1)
    return driver.find_element(By.CSS_SELECTOR, "a#invite-link").get_attribute("href")


def join_lobby_if_needed(driver, invite_link: str | None):
    if not invite_link:
        return

    try:
        el = driver.find_element(By.CSS_SELECTOR, "input#create-lobby")
    except NoSuchElementException:
        return
    driver.get(invite_link)
    time.sleep(0.1)


def my_team(driver, index: int):
    for pl in driver.find_elements(By.CSS_SELECTOR, "semantic-player"):
        team = pl.find_element(By.CSS_SELECTOR, "semantic-team")
        nick = pl.find_element(By.CSS_SELECTOR, "semantic-nick")

        if nick.text == f"client {index}":
            team_id = team.get_attribute("x-hl").split(":")[1]
            if team_id == "null":
                return None
            return int(team_id)
    return None


def join_team_if_needed(driver, index: int):
    if my_team(driver, index) is not None:
        return
    try:
        driver.find_element(
            By.CSS_SELECTOR, "#join-team-" + str(1 if index % 2 == 0 else 2)
        ).click()
        time.sleep(0.1)
    except NoSuchElementException:
        pass


def start_game_if_possible(driver):
    try:
        el = driver.find_element(By.CSS_SELECTOR, "input#start-game")
        if el.is_enabled():
            el.click()
            time.sleep(0.1)
    except NoSuchElementException:
        pass


def do_input_actions(driver, index, strategy) -> Optional[str]:
    try:
        round_index = (
            int(
                driver.find_element(
                    By.CSS_SELECTOR, ".history tr:last-child td:first-child"
                ).get_attribute("innerText")
            )
            - 1
        )
    except NoSuchElementException:
        return None

    try:
        for ia in driver.find_elements(By.CSS_SELECTOR, "div.input-action"):

            try:
                h1 = ia.find_element(By.CSS_SELECTOR, "h1").get_attribute("innerText")
            except NoSuchElementException:
                continue
            if "It's your turn to give clues!" in h1:
                # Give clues
                time.sleep(0.3)
                for row in ia.find_elements(By.CSS_SELECTOR, "tr"):
                    clue_for = row.find_element(
                        By.CSS_SELECTOR, "td:nth-child(1)"
                    ).get_attribute("innerText")
                    clue_input = row.find_element(
                        By.CSS_SELECTOR, "td:nth-child(3) input[type=text]"
                    )
                    if clue_input.get_attribute("value") == "":
                        clue_input.send_keys("kw=" + clue_for[:-1])
                time.sleep(0.5)
                submit = ia.find_element(By.CSS_SELECTOR, "#submit-clues")
                if not submit.get_attribute("disabled"):
                    submit.click()
                time.sleep(0.1)
            elif "decipher your clues" in h1:
                correct = "-".join(
                    ct.get_attribute("innerText").split("=")[1]
                    for ct in ia.find_elements(By.CSS_SELECTOR, ".semantic-clue-text")
                )
                use_correct = strategy(
                    StrategyInput(
                        player_index=index,
                        team=bool(index % 2),
                        round_index=round_index,
                        situation="guess",
                    )
                )
                textbox = ia.find_element(By.CSS_SELECTOR, "input[type=text]")
                if textbox.get_attribute("value") == "":
                    textbox.send_keys(correct if use_correct else correct[::-1])
                    textbox.send_keys(Keys.ENTER)
                    time.sleep(0.1)
                else:
                    textbox.clear()
            elif "Attempt interception" in h1:
                correct = "-".join(
                    ct.get_attribute("innerText").split("=")[1]
                    for ct in ia.find_elements(By.CSS_SELECTOR, ".semantic-clue-text")
                )
                use_correct = strategy(
                    StrategyInput(
                        player_index=index,
                        team=bool(index % 2),
                        round_index=round_index,
                        situation="intercept",
                    )
                )
                textbox = ia.find_element(By.CSS_SELECTOR, "input[type=text]")
                if textbox.get_attribute("value") == "":
                    textbox.send_keys(correct if use_correct else correct[::-1])
                    textbox.send_keys(Keys.ENTER)
                    time.sleep(0.1)
                else:
                    textbox.clear()
            elif "Waiting for" in h1:
                pass
            elif "Tiebreaker" in h1:
                for textbox in ia.find_elements(By.CSS_SELECTOR, "input[type=text]"):
                    if textbox.get_attribute("value") == "":
                        textbox.send_keys("I guess, nope")
                        textbox.send_keys(Keys.ENTER)
                        time.sleep(0.1)
                        break
                    else:
                        textbox.clear()
            elif "Game Over" in h1:
                if "win" in h1 or "won" in h1:
                    return "win"
                elif "lose" in h1 or "lost" in h1:
                    return "loss"
                elif "draw" in h1:
                    return "draw"
                else:
                    raise ValueError(f"Unexpected game result: {h1}")
            else:
                raise ValueError(f"Unexpected input action: {h1}")
    except StaleElementReferenceException:
        return None
    return None


@dataclass
class StrategyInput:
    player_index: int
    team: bool
    round_index: int
    situation: str

    def with_situation(self, situation: str):
        return StrategyInput(
            player_index=self.player_index,
            team=self.team,
            round_index=self.round_index,
            situation=situation,
        )


class JsError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message

    def __str__(self):
        return self.message


def simple_player(
    index: int,
    port: int,
    shared: SharedState,
    strategy: Callable[[StrategyInput], bool],
):
    driver = new_isolated_firefox()
    try:
        driver.get(f"http://127.0.0.1:{port}")
        time.sleep(0.3)

        # lobby/join loop
        while not shared.stop_event.is_set():
            if err := driver.execute_script("return window.CATCH_ERROR;"):
                raise JsError(err.replace(f"http://127.0.0.1:{port}/", "static/"))

            set_nick_if_needed(driver, index)

            if index == 0 and shared.invite_link is None:
                invite_link = create_lobby_if_needed(driver)
                if invite_link:
                    shared.invite_link = invite_link
            else:
                join_lobby_if_needed(driver, shared.invite_link)

            join_team_if_needed(driver, index)
            time.sleep(0.1)

            if index == 0:
                start_game_if_possible(driver)

            if game_result := do_input_actions(driver, index, strategy):
                shared.results[index] = game_result
                return
            time.sleep(0.5)
    except Exception as e:
        if shared.first_error is None:
            shared.first_error = e
        shared.stop_event.set()
    finally:
        driver.quit()

# Easy-Fishing-5.0
Original version made by https://github.com/terastuff/easy-fishing

# Existing Commands/Functions from 3.0
!ef - Toggles the module on and off.

!ef craft - Toggles auto bait crafting.

!ef delay - Toggles random delay for catching and adding items to dismantle ui.

!ef distance [0, 18] - Sets cast distance from 0 to 18 (Keep in mind, anything above 3 is not possible without a module.)

!ef s/dismantle - Toggles auto fish dismantling.

!ef s/sell - Toggles auto selling (You have to be close to a merchant, and open it's selling UI before fishing.)

!ef discard - Toggles discarding fish filets when reaching 10k.

!ef discard (amount) - Set the amount of fish filets to discard.

!ef salad - Toggles auto reuse of fish salad when the buff is gone (Have to use the first one manually. It will refresh after it's if you're fishing.)


# Commands/Functions added by me
!ef start - Throws rod and starts fish and skill tome logging. 

!ef stop - Stops fishing after finished with the current fish and all pending brokerage. Can also cancel rod after typing "ef stop" to cancel faster.

!ef snow - Sells to NPC now

!ef dnow - Dismantles now

!ef worm - Toggles worm discarding

!ef worm (amount) - Sets the threshold for worm discarding

!ef baf - Toggle selling/dismantling of BAF so that you can turn them into the merchant for 10x the price

!ef status - Displays the state of all variables


I also added support for Auto-Brokerage: https://github.com/Owyn/auto-nego

If fishing stops while you're tabbed out or if rod spam protection activates, you will be notified through https://github.com/SerenTera/tera-notifier

If you have discard disabled, when you run out of Fish Fillets, dismantle will be disabled and selling will be enabled. When you reach max Fish Fillets, dismantle will be enabled and selling will be disabled.
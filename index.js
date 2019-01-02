let Readable;
// Happy new years update from TerableCoder
try {
    ({Readable} = require('tera-data-parser/lib/protocol/stream')); 
} catch (e) {
    ({Readable} = require('tera-data-parser/protocol/stream'));
}

const CRAFTABLE_BAITS = [
	{name: "Bait II", itemId: 206001, abnormalityId: 70272, recipeId: 204100},
	{name: "Bait III", itemId: 206002, abnormalityId: 70273, recipeId: 204101},
	{name: "Bait IV", itemId: 206003, abnormalityId: 70274, recipeId: 204102},
	{name: "Bait V", itemId: 206004, abnormalityId: 70275, recipeId: 204103}
];

const RODS = [206700, 206701, 206702, 206703, 206704, 206705, 206706, 206707, 206708, 206709, 206710, 206711, 206712, 206713, 206714, 206715, 206716, 206717, 206718, 206719, 206720, 206721, 206722, 206723, 206724, 206725, 206726, 206727, 206728];

module.exports = function EasyFishing(mod) {
	const command = mod.command || mod.require.command;
	
	if (mod.proxyAuthor !== 'caali') {
		const options = require('./module').options
		if (options) {
			const settingsVersion = options.settingsVersion
			if(settingsVersion) {
				mod.settings = require('./' + (options.settingsMigrator || 'module_settings_migrator.js'))(mod.settings._version, settingsVersion, mod.settings)
				mod.settings._version = settingsVersion
			}
		}
	}

    let gameId = 0n,
    	currentBait = null,
    	lastBait = null,
    	playerLocation = {x: 0, y: 0, z: 0},
    	playerAngle = 0,
    	fishingRod = null,
    	waitingInventory = false,
    	dismantling = false,
    	selling = false,
    	itemsToProcess = [],
    	cannotDismantle = false,
    	crafting = false,
    	successCount = 0,
    	lastContact = {},
    	lastDialog = {},
    	discarding = false,
    	useSalad = false;
		
	let hasNego = mod.manager.isLoaded('auto-nego'),
		pendingDeals = [],
		negoWaiting = false,
		timeout = null,
		amFishing = false,
		retryNumber = 0,
		stopFishing = false,
		consoleMsg = false;

    function rand([min, max], lowerBound) {
    	lowerBound = isNaN(lowerBound) ? Number.NEGATIVE_INFINITY : lowerBound;
    	min = parseInt(min);
    	max = parseInt(max);

    	if (isNaN(min) || isNaN(max)) {
    		return lowerBound;
    	}

    	const result = Math.floor(Math.random() * (max - min + 1)) + min;
    	return result >= lowerBound ? result : lowerBound;
    }

    function validate(value, lowerBound, upperBound, defaultValue) {
    	value = parseInt(value);
    	if (isNaN(value)) {
    		return defaultValue;
    	}
    	if (value < lowerBound) {
    		return lowerBound;
    	}
    	if (value > upperBound) {
    		return upperBound;
    	}
    	return value;
    }
	
	function timeStamp(msg) {
		let timeNow = new Date();
		let timeText = timeNow.getHours().toLocaleString(undefined, {minimumIntegerDigits: 2}) + ':' +
			timeNow.getMinutes().toLocaleString(undefined, {minimumIntegerDigits: 2}) + ':' + 
			timeNow.getSeconds().toLocaleString(undefined, {minimumIntegerDigits: 2});
		return ("[" + timeText + "] ");
	}
	
	command.add('easyfishing', {
    	$default() {
    		mod.settings.enabled = !mod.settings.enabled;
        	command.message(`Easy fishing is now ${mod.settings.enabled ? "enabled" : "disabled"}.`);
    	},
    	craft() {
	    	mod.settings.autoCrafting = !mod.settings.autoCrafting;
	    	command.message(`Auto bait crafting is now ${mod.settings.autoCrafting ? "enabled" : "disabled"}.`);
    	},
    	dismantle() {
        	mod.settings.autoDismantling = !mod.settings.autoDismantling;
    		command.message(`Auto dismantling fish is now ${mod.settings.autoDismantling ? "enabled" : "disabled"}.`);		
    	},
    	delay() {
    		mod.settings.useRandomDelay = !mod.settings.useRandomDelay;
    		command.message(`Random delay is now ${mod.settings.useRandomDelay ? "enabled" : "disabled"}.`);
    	},
    	distance(value) {
    		mod.settings.castDistance = validate(value, 0, 18, 3);
    		command.message(`Cast distance set to ${mod.settings.castDistance}.`);
    	},
    	sell() {
        	mod.settings.autoSelling = !mod.settings.autoSelling;
    		command.message(`Auto selling fish is now ${mod.settings.autoSelling ? "enabled" : "disabled"}.`);	
    	},
    	discard(amount) {
    		amount = parseInt(amount);
    		if (isNaN(amount)) {
    			mod.settings.discardFilets = !mod.settings.discardFilets;
    			command.message(`Discard filets is now ${mod.settings.discardFilets ? "enabled" : "disabled"}.`);
    		} else {
    			mod.settings.discardCount = amount;
    			command.message(`Discard filets count set to ${mod.settings.discardCount}.`);
    		}
    	},
    	salad() {
        	mod.settings.reUseFishSalad = !mod.settings.reUseFishSalad;
    		command.message(`Reuse fish salad is now ${mod.settings.reUseFishSalad ? "enabled" : "disabled"}.`);			
    	},
		stop() {
        	stopFishing = true;
    		command.message(`Fishing will stop soon...`);			
    	},
		consoleMsg() {
        	consoleMsg = !consoleMsg;
    		command.message(`consoleMsg = ${consoleMsg ? "enabled" : "disabled"}.`);			
    	}
    });

	function startCraftingBait() {
		if (!crafting) {
			successCount = 0;
		}
		crafting = true;
    	mod.toServer('C_START_PRODUCE', 1, {
    		recipe: lastBait.recipeId,
    		unk: 0
    	});
    }

    function startFishing() {
		mod.toServer('C_USE_ITEM', 3, { // use rod
			gameId,
			id: fishingRod,
			dbid: 0,
			target: 0,
			amount: 1,
			dest: 0,
			loc: playerLocation,
			w: playerAngle,
			unk1: 0,
			unk2: 0,
			unk3: 0,
			unk4: true
		});
    }

    function startDismantling() {
    	itemsToProcess = [];
    	waitingInventory = true;
    	dismantling = true;
    	mod.toServer('C_SHOW_INVEN', 1, {unk: 1});
    }

    function startSelling() {
    	if (lastContact.gameId && lastDialog.id) {
	        itemsToProcess = [];
	    	waitingInventory = true;
	    	selling = true;
	    	mod.toServer('C_SHOW_INVEN', 1, {unk: 1});
    	} else {
    		if (mod.settings.autoDismantling) {
    			command.message('Failed to start auto sell. Cannot find last merchant npc dialog. Dismantling...');
    			startDismantling();
    		} else {
    			command.message('Failed to start auto sell. Cannot find last merchant npc dialog. Stopping...');
				amFishing = false;
    		}
    	}
    }

    function startDiscarding() {
    	discarding = true;
    	mod.toServer('C_SHOW_INVEN', 1, {unk: 1});
    }

    function processItemsToDismantle() {
    	if (itemsToProcess.length > 0) {
    		mod.toServer('C_REQUEST_CONTRACT', 1, {
    			type: 89,
    			unk2: 0,
    			unk3: 0,
    			unk4: 0,
    			name: "",
    			data: Buffer.alloc(0)
    		})
    	} else {
    		dismantling = false;
    	}
    }

    function processItemsToSell() {
    	if (itemsToProcess.length > 0) {
    		mod.toServer('C_NPC_CONTACT', 2, lastContact);
    		let dialogHook;
			
			clearTimeout(timeout);
    		timeout = mod.setTimeout(() => {
    			if (dialogHook) {
    				mod.unhook(dialogHook);
    				selling = false;
    				command.message("Failed to contact npc.");
		    		if (mod.settings.autoDismantling) {
		    			command.message('Failed to contact npc. Dismantling...');
		    			startDismantling();
		    		} else {
		    			command.message('Failed to contact npc. Stopping...');
						amFishing = false;
		    		}
    			}
    		}, 5000);

    		dialogHook = mod.hookOnce('S_DIALOG', 2, event => {
				mod.clearTimeout(timeout);
    			mod.toServer('C_DIALOG', 1, Object.assign(lastDialog, { id: event.id }));
    		});
    	} else {
    		selling = false;
    	}
    }

    mod.hook('C_NPC_CONTACT', 2, event => {
    	Object.assign(lastContact, event);
    });

    mod.hook('C_DIALOG', 1, event => {
    	Object.assign(lastDialog, event);
    });

    mod.hook('C_CAST_FISHING_ROD', 'raw', (code, data) => {
    	data[20] = validate(mod.settings.castDistance, 0, 18, 3);
    	return true;
    });

    mod.hook('S_END_PRODUCE', 1, event => {
    	if (crafting) {
			if (event.success) {
				successCount++;
				startCraftingBait();
			} else {
				crafting = false;
				
				if (successCount == 0) {
					if (mod.settings.autoDismantling) {
						startDismantling();
					} else {
						command.message("Failed to auto craft. Stopping...");
						amFishing = false;
					}
				} else {
					mod.toServer('C_USE_ITEM', 3, { // use bait
		    			gameId,
						id: lastBait.itemId,
						dbid: 0n,
						target: 0n,
						amount: 1,
						dest: 0,
						loc: playerLocation,
						w: playerAngle,
						unk1: 0,
						unk2: 0,
						unk3: 0,
						unk4: true
					});
					clearTimeout(timeout);
					timeout = setTimeout(() => {
						if (currentBait) {
							startFishing();
						} else {
							command.message("Failed to auto fish. Stopping...");
							amFishing = false;
						}
					}, 1000);
				}
			}
		}
	});

	mod.hook('S_REQUEST_CONTRACT', 1, event => {
		if (dismantling || selling) {
			if (event.type == 89) {
				const handleContract = () => {
					let delay = mod.settings.useRandomDelay ? rand(mod.settings.moveItemDelay, 200) : 200;

					for (let item of itemsToProcess.slice(0, 20)) {
						timeout = mod.setTimeout(() => {
							if (cannotDismantle) return;

							mod.toServer('C_RQ_ADD_ITEM_TO_DECOMPOSITION_CONTRACT', 1, {
								contract: event.id,
								dbid: item.dbid,
								id: item.id,
								count: 1
							});
						}, delay);
						delay += mod.settings.useRandomDelay ? rand(mod.settings.moveItemDelay, 200) : 200;
					}
					itemsToProcess = itemsToProcess.slice(20);
					timeout = mod.setTimeout(() => {
						mod.toServer('C_RQ_START_SOCIAL_ON_PROGRESS_DECOMPOSITION', 1, { contract: event.id });

						timeout = mod.setTimeout(() => {
							if (cannotDismantle) {
								itemsToProcess = [];
								cannotDismantle = false;
								dismantling = false;

								mod.toServer('C_CANCEL_CONTRACT', 1, {
									type: 89,
									id: event.id
								});

								if (mod.settings.discardFilets && mod.settings.discardCount > 0) {
									clearTimeout(timeout);
									timeout = setTimeout(startDiscarding, 2000);
								} else {
									command.message(`Auto fishing stopping, cannot dismantle any more fish.`);
									amFishing = false;
								}
								return;
							}

							if (itemsToProcess.length > 0) {
								handleContract();
							} else {
								dismantling = false;

								mod.toServer('C_CANCEL_CONTRACT', 1, {
									type: 89,
									id: event.id
								});
								clearTimeout(timeout);
								timeout = setTimeout(startFishing, 2000);
							}
						}, 3000);
					}, delay);
				};
				handleContract();
			} else if (event.type === 9) {
				if (itemsToProcess.length > 0) {
					let delay = mod.settings.useRandomDelay ? rand(mod.settings.moveItemDelay, 200) : 200;

					for (let item of itemsToProcess.slice(0, 8)) {
						timeout = mod.setTimeout(() => {
							mod.toServer('C_STORE_SELL_ADD_BASKET', 1, {
								cid: gameId,
								npc: event.id,
								item: item.id,
								quantity: 1,
								slot: item.slot
							});
						}, delay);
						delay += mod.settings.useRandomDelay ? rand(mod.settings.moveItemDelay, 200) : 200;
					}
					itemsToProcess = itemsToProcess.slice(8);
					timeout = mod.setTimeout(() => {
						mod.toServer('C_STORE_COMMIT', 1, { gameId, contract: event.id });
					}, delay);
				} else {
					selling = false;
					mod.toServer('C_CANCEL_CONTRACT', 1, {
						type: 9,
						id: event.id
					});
					clearTimeout(timeout);
					timeout = setTimeout(startFishing, 2000);
				}
			}
		}
	});

    mod.hook('S_INVEN', 16, event => {
    	if (!dismantling && !selling && !discarding) return;

    	if (waitingInventory) {
	    	for (const item of event.items) {
	    		if (mod.settings[selling ? "autoSellFishes" : "autoDismantleFishes"].find(id => id == item.id)) {
	    			itemsToProcess.push({dbid: item.dbid, id: item.id, slot: item.slot});
	    		}
	    	}

	    	if (!event.more) {
	    		waitingInventory = false;
	    		if (dismantling) {
	    			processItemsToDismantle();
	    		} else if (selling) {
	    			processItemsToSell();
	    		}
	    	}
    	}

    	if (discarding) {
    		for (const item of event.items) {
    			if (item.id == 204052) {
    				discarding = false;
    				mod.send('C_DEL_ITEM', 2, {
						gameId,
						slot: item.slot - 40,
						amount: Math.min(item.amount, mod.settings.discardCount)
					});
					clearTimeout(timeout);
					timeout = setTimeout(startFishing, 2000);
					break;
    			}
    		}

    		if (!event.more && discarding) {
    			discarding = false;
    			command.message('Something really weird happened, could not discard filets. Stopping...');
				amFishing = false;
    		}
    	}
    });

    mod.hook('S_LOGIN', 12, event => {
        ({gameId} = event);
    });

    mod.hook('S_FISHING_BITE', 'raw', (code, data) => {
        if (!mod.settings.enabled) return;

		retryNumber = 0;
        const stream = new Readable(data);
        stream.position = 8;
        if (stream.uint64() === gameId) {
            mod.toServer('C_START_FISHING_MINIGAME', 1, {});
        }
    });

	mod.hook('S_CAST_FISHING_ROD', 'raw', (code, data) => {
        const stream = new Readable(data);
        stream.position = 4;
        if (stream.uint64() === gameId) {
       		stream.position = 25;
       		fishingRod = stream.uint32();
        }
    });    

    mod.hook('S_START_FISHING_MINIGAME', 'raw', (code, data) => {
        if (!mod.settings.enabled) return;
		
        const stream = new Readable(data);
        stream.position = 8;
        if (stream.uint64() === gameId) {
			clearTimeout(timeout);
            timeout = mod.setTimeout(() => {
                mod.toServer('C_END_FISHING_MINIGAME', 1, {
                    success: true
                });
            }, mod.settings.useRandomDelay ? rand(mod.settings.catchDelay, 2000) : 2000);
            return false;
        }
    });

    mod.hook('C_USE_ITEM', 3, event => {
    	if (RODS.includes(event.id)) {
			if(pendingDeals.length){
				command.message("Dealing with negotiations.");
				negoWaiting = true;
				for(let i = 0; i < pendingDeals.length; i++){
					mod.toClient('S_TRADE_BROKER_DEAL_SUGGESTED', 1, pendingDeals[i]);
					pendingDeals.splice(i--, 1);
				}
				if(stopFishing){ // so you don't have to wait an extra fish
					stopFishing = false;
					amFishing = false;
					clearTimeout(timeout);
					timeout = setTimeout(() => {
						command.message("Fishing stopped.");
					}, 9000);
				} else {
					clearTimeout(timeout);
					timeout = setTimeout(startFishing, 18000);
				}
				return false;
			} 
			
			if (stopFishing) {
				command.message("Fishing stopped.");
				stopFishing = false;
				amFishing = false;
				return false;
			}
			
			if (useSalad) {
		    	mod.toServer('C_USE_ITEM', 3, {
					gameId,
					id: 206020,
					dbid: 0,
					target: 0,
					amount: 1,
					dest: 0,
					loc: playerLocation,
					w: playerAngle,
					unk1: 0,
					unk2: 0,
					unk3: 0,
					unk4: true
				});
				useSalad = false;
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 1000);
				return false;
			}
			negoWaiting = false;
			amFishing = true;

			if (mod.settings.autoSelling && (!lastContact.gameId || !lastDialog.id)) {
				mod.toClient('S_CHAT', 2, { channel: 21, authorName: 'KTC', message: "You have auto selling turned on, but you didn't talk to any NPC. It will NOT auto sell!!!!"});
			}
		}
	});

	mod.hook('C_PLAYER_LOCATION', 5, event => { // the restriction on this caused playerLocation to sometimes never update, thus bait usage would fail
		Object.assign(playerLocation, event.loc);
		playerAngle = event.w;
	});

    mod.hook('S_ABNORMALITY_BEGIN', 3, event => {
    	if (event.target === gameId) {
    		currentBait = CRAFTABLE_BAITS.find(obj => obj.abnormalityId === event.id) || currentBait;
    		lastBait = currentBait || lastBait;
    	}
    });

    mod.hook('S_ABNORMALITY_END', 1, event => {
    	if (event.target !== gameId) return;

    	if (currentBait && currentBait.abnormalityId === event.id) {
    		currentBait = null;
    	} else if (event.id === 70261 && mod.settings.reUseFishSalad) {
    		useSalad = true;
    	}
    });

    mod.hook('S_SYSTEM_MESSAGE', 1, event => {
    	if (!mod.settings.enabled || !amFishing) return;
		
    	const msg = mod.parseSystemMessage(event.message);
		if(consoleMsg){
			console.log("Logged Message");
			console.log(msg);
		}
    	if (msg) {
    		if (mod.settings.autoCrafting && lastBait && msg.id === 'SMT_CANNOT_FISHING_NON_BAIT') { // out of bait
    			mod.toServer('C_USE_ITEM', 3, { // use bait
	    			gameId,
					id: lastBait.itemId,
					dbid: 0,
					target: 0,
					amount: 1,
					dest: 0,
					loc: playerLocation,
					w: playerAngle,
					unk1: 0,
					unk2: 0,
					unk3: 0,
					unk4: true
    			});
				clearTimeout(timeout);
    			timeout = setTimeout(() => {
    				if (!currentBait && lastBait) {
    					startCraftingBait();
    				} else {
    					startFishing();
    				}
    			}, 1000);
    		} else if (msg.id === 'SMT_CANNOT_FISHING_FULL_INVEN') { // full inven
    			if (mod.settings.autoSelling && !selling) {
    				startSelling();
    			} else if (mod.settings.autoDismantling && !dismantling) {
    				startDismantling();
    			} else {
    				command.message("Full inventory and no auto dismantling nor auto selling. Stopping...");
					amFishing = false;
    			}
    		} else if (msg.id === 'SMT_ITEM_CANT_POSSESS_MORE' && msg.tokens && msg.tokens['ItemName'] === '@item:204052') { // too many fish fillets
    			cannotDismantle = true;
    		} else if(msg.id === 'SMT_CANNOT_FISHING_NON_AREA' && !negoWaiting){ // non-fishing area bug
				command.message("Non-fishing area bug? Retrying.");
				clearTimeout(timeout);
				retryNumber++;
				if(retryNumber < 4){
					timeout = setTimeout(startFishing, 3000);
				} else{
					retryNumber = 0;
					command.message("Fishing area couldn't be found. Stopping...");
					amFishing = false;
				}
			} else if(msg.id === 'SMT_PROHIBITED_ACTION_ON_RIDE' && !negoWaiting){ // mounted
				command.message("Can't fish while mounted. Retrying.");
				clearTimeout(timeout);
				retryNumber++;
				if(retryNumber < 2){
					timeout = setTimeout(startFishing, 3000);
				} else{
					retryNumber = 0;
					command.message("Can't fish while mounted. Stopping...");
					amFishing = false;
				}
			} else if(msg.id === 'SMT_FISHING_RESULT_CANCLE' && stopFishing && !pendingDeals.length){ // intentionally stopping
				command.message("Fishing stopped.");
				stopFishing = false;
				amFishing = false;
			} else if(msg.id === 'SMT_FISHING_RESULT_CANCLE' && !pendingDeals.length){ // cancelled?
				command.message("Fishing cancelled. Retrying.");
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 3000);
			} else if(msg.id === 'SMT_FISHING_RESULT_CANCLE'){ // cancelled and deals pending
				command.message("Fishing cancelled, but we have negotiations to handle!");
				if(pendingDeals.length){ // double check
					command.message("Dealing with negotiations.");
					negoWaiting = true;
					for(let i = 0; i < pendingDeals.length; i++){
						mod.toClient('S_TRADE_BROKER_DEAL_SUGGESTED', 1, pendingDeals[i]);
						pendingDeals.splice(i--, 1);
					}
					if(stopFishing){ // so you don't have to wait an extra fish
						stopFishing = false;
						amFishing = false;
						clearTimeout(timeout);
						timeout = setTimeout(() => {
							command.message("Fishing stopped.");
						}, 9000);
					} else {
						clearTimeout(timeout);
						timeout = setTimeout(startFishing, 9000);
					}
				} else { // shouldn't happen
					command.message("Let me catch just one more fish! Then I'll negotiate.");
					clearTimeout(timeout);
					timeout = setTimeout(startFishing, 1000); // this should start the nego
				}
			} else if(msg.id === 'SMT_YOU_ARE_BUSY'){ // being party invited, traded, etc.
				command.message("You're busy. Retrying.");
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 3000);
			} else if(negoWaiting && !pendingDeals.length && msg.id === 'SMT_MEDIATE_SUCCESS_SELL'){ // finished all negotiations
				//command.message("Negotiations finished. Resuming."); // too much spam
				negoWaiting = false;
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 1000);
			} else if(msg.id === 'SMT_CANNOT_USE_ITEM_WHILE_CONTRACT'){ // still negotiating
				//command.message("Negotiations still inprogress. I'll try again later."); // too much spam
				negoWaiting = true;
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 9000);
			} else if(msg.id === 'SMT_CANNOT_FISHING_NON_BAIT'){ // no bait
				command.message("Can't fish without bait. Use a craftable bait then try again. Stopping...");
				amFishing = false;
			} else if(msg.id === 'SMT_PET_CANT_ACTION_ORDER'){ // using pet, sometimes sends no message and fishing stops
				command.message("Can't fish while you're using a pet. Retrying.");
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 3000);
			} else if(msg.id === 'SMT_CANNOT_FISHING_NON_AREA'){ // non-fishing area bug while negoWaiting
			} else if(msg.id === 'SMT_PROHIBITED_ACTION_ON_RIDE'){ // mounted while negoWaiting
			} else if(msg.id === 'SMT_MEDIATE_SUCCESS_SELL'){ // sold item with more deals to finish
			
			} else if(msg.id === 'SMT_CANNOT_HAVE_MORE_ITEMS'){ // can't have more fish fillets
			} else if(msg.id === 'SMT_GENERAL_CANT_REG_ITEM_LIMIT'){ // can't have more fish fillets
			} else if(msg.id === 'SMT_ITEM_DELETED'){ // deleted fish fillets
			
			} else if(msg.id === 'SMT_FISHING_RESULT_SUCCESS'){ // caught a fish
			} else if(msg.id === 'SMT_ITEM_USED'){ // used banker summon
			} else if(msg.id === 'SMT_WAREHOUSE_ITEM_INSERT'){ // insert to bank
			} else if(msg.id === 'SMT_WAREHOUSE_ITEM_DRAW'){ // withdraw from bank
			} else if(msg.id === 'SMT_GACHA_REWARD'){ // someone got a reward from a box
			} else if(msg.id === 'SMT_MAX_ENCHANT_SUCCEED'){ // enchant success message
			} else if(msg.id === 'SMT_GUILD_MEMBER_LOGON_NO_MESSAGE'){ // guild member login, empty login message
			} else if(msg.id === 'SMT_GUILD_MEMBER_LOGON'){ // guild member logon with login message
			} else if(msg.id === 'SMT_GUILD_MEMBER_LOGOUT'){ // guild member logout
			//} else if(msg.id === ''){ // guild quest accept
			//} else if(msg.id === ''){ // guild quest success
			} else if(msg.id === 'SMT_GQUEST_NORMAL_FAIL_OVERTIME'){ // guild quest failed
			} else if(msg.id === 'SMT_FISHING_REWARD'){ // someone caught a BAF
			} else if(msg.id === 'SMT_USE_ITEM_NO_EXIST'){ // item doesn't exist, aka lag when trading
			} else if(msg.id === 'SMT_NO_ITEM'){ // no bait
			} else if(msg.id === 'SMT_ITEM_CANT_POSSESS_MORE'){ // can't craft more bait, or can't have more fish fillets
			} else if(msg.id === 'SMT_ITEM_USED_ACTIVE'){ // used bait on
			} else if(msg.id === 'SMT_ITEM_USED_DEACTIVE'){ // used bait off
			} else if(msg.id === 'SMT_HIDDEN_QUEST_TASK_END'){ // completed vanguard
			} else if(msg.id === 'SMT_MEDIATE_REG_SUCCESS_ITEM'){ // listed item onto broker
			} else if(msg.id === 'SMT_MEDIATE_SUCCESS_BUY'){ // bought item from broker
			} else if(msg.id === 'SMT_MEDIATE_TRADE_FINISH_USE_MONEY'){ // pay for the brokered item
			} else if(msg.id === 'SMT_MEDIATE_FAIL_CALCULATE'){ // too poor to buy from broker
			} else if(msg.id === 'SMT_MEDIATE_CALCULATE'){ // broker thing before claim
			} else if(msg.id === 'SMT_MEDIATE_CALCULATE_GET_ITEM'){ // get item from broker
			} else if(msg.id === 'SMT_MEDIATE_CALCULATE_GET_MONEY'){ // get money from item sold on broker
			} else if(msg.id === 'SMT_LOOTED_MONEY'){ // vendored fish
			} else if(msg.id === 'SMT_ITEM_DECOMPOSE_COMPLETE'){ // dismantled fish
			} else if(msg.id === 'SMT_BATTLE_SKILL_FAIL_COOL_TIME'){ // skill on cd
			} else if(msg.id === 'SMT_FIELD_EVENT_WORLD_ANNOUNCE'){ // superior guardian mission
			} else if(msg.id === 'SMT_PLAYTIME_TIMER'){ // you've been playing for x hours
			} else if(msg.id === 'SMT_KOREAN_RATING_TEENAGER_PROHIBITED'){ // logs off koreans?
			} else {
				console.log(timeStamp() + "Something fishy is going on here...");
				console.log(msg);
			}
    	}
    });
	
	mod.hook('S_TRADE_BROKER_DEAL_SUGGESTED', 1, event => { // store nego request
		if(mod.settings.enabled && amFishing && hasNego && !negoWaiting && event.offeredPrice === event.sellerPrice){
			for(let i = 0; i < pendingDeals.length; i++){
				let deal = pendingDeals[i];
				if(deal.playerId == event.playerId && deal.listing == event.listing) pendingDeals.splice(i--, 1);
			}
			pendingDeals.push(event);
			command.message("Negoiation suggested, I'll address it after this fish.");
			return false;
		}
	});
	
    mod.hook('C_CHAT', 1, event => {
    	if (event.channel === 10 && mod.settings.enabled) {
    		return false;
    	}
    });
}

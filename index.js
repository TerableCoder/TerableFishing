let Readable;

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
    	mod.toServer('C_USE_ITEM', 3, {
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
    			command.message('Failed to start auto sell. Cannot find last merchant npc dialog. Stoping...');
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

    		const timeout = mod.setTimeout(() => {
    			if (dialogHook) {
    				mod.unhook(dialogHook);
    				selling = false;
    				command.message("Failed to contact npc.");
		    		if (mod.settings.autoDismantling) {
		    			command.message('Failed to contact npc. Dismantling...');
		    			startDismantling();
		    		} else {
		    			command.message('Failed to contact npc. Stoping...');
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
						command.message("Failed to auto craft. Stoping...");
					}
				} else {
					mod.toServer('C_USE_ITEM', 3, {
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
					mod.setTimeout(() => {
						if (currentBait) {
							startFishing();
						} else {
							command.message("Failed to auto fish. Stoping...");
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
						mod.setTimeout(() => {
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
					mod.setTimeout(() => {
						mod.toServer('C_RQ_START_SOCIAL_ON_PROGRESS_DECOMPOSITION', 1, { contract: event.id });

						mod.setTimeout(() => {
							if (cannotDismantle) {
								itemsToProcess = [];
								cannotDismantle = false;
								dismantling = false;

								mod.toServer('C_CANCEL_CONTRACT', 1, {
									type: 89,
									id: event.id
								});

								if (mod.settings.discardFilets && mod.settings.discardCount > 0) {
									mod.setTimeout(startDiscarding, 2000);
								} else {
									command.message(`Auto fishing stopping, cannot dismantle any more fish.`);
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
								mod.setTimeout(startFishing, 2000);
							}
						}, 3000);
					}, delay);
				};
				handleContract();
			} else if (event.type === 9) {
				if (itemsToProcess.length > 0) {
					let delay = mod.settings.useRandomDelay ? rand(mod.settings.moveItemDelay, 200) : 200;

					for (let item of itemsToProcess.slice(0, 8)) {
						mod.setTimeout(() => {
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
					mod.setTimeout(() => {
						mod.toServer('C_STORE_COMMIT', 1, { gameId, contract: event.id });
					}, delay);
				} else {
					selling = false;
					mod.toServer('C_CANCEL_CONTRACT', 1, {
						type: 9,
						id: event.id
					});
					mod.setTimeout(startFishing, 2000);
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
					mod.setTimeout(startFishing, 2000);
					break;
    			}
    		}

    		if (!event.more && discarding) {
    			discarding = false;
    			command.message('Something really weird happened, could not discard filets. Stoping...');
    		}
    	}
    });

    mod.hook('S_LOGIN', 10, event => {
        ({gameId} = event);
    });

    mod.hook('S_FISHING_BITE', 'raw', (code, data) => {
        if (!mod.settings.enabled) return;

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
            mod.setTimeout(() => {
                mod.toServer('C_END_FISHING_MINIGAME', 1, {
                    success: true
                });
            }, mod.settings.useRandomDelay ? rand(mod.settings.catchDelay, 2000) : 2000);
            return false;
        }
    });

    mod.hook('C_USE_ITEM', 3, event => {
    	if (RODS.includes(event.id)) {
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
				mod.setTimeout(startFishing, 1000);
				return false;
			}

			if (mod.settings.autoSelling && (!lastContact.gameId || !lastDialog.id)) {
				mod.toClient('S_CHAT', 2, { channel: 21, authorName: 'KTC', message: "You have auto selling turned on, but you didn't talk to any NPC. It will NOT auto sell!!!!"});
			}
		}
	});

	mod.hook('C_PLAYER_LOCATION', 5, event => {
		if ([0, 1, 5, 6].includes(event.type)) {
			Object.assign(playerLocation, event.loc);
			playerAngle = event.w;
		}
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
    	if (!mod.settings.enabled) return;
    	
    	const msg = mod.parseSystemMessage(event.message);
    	if (msg) {
    		if (mod.settings.autoCrafting && lastBait && msg.id === 'SMT_CANNOT_FISHING_NON_BAIT') {
    			mod.toServer('C_USE_ITEM', 3, {
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
    			mod.setTimeout(() => {
    				if (!currentBait && lastBait) {
    					startCraftingBait();
    				} else {
    					startFishing();
    				}
    			}, 1000);
    		} else if (msg.id === 'SMT_CANNOT_FISHING_FULL_INVEN') {
    			if (mod.settings.autoSelling && !selling) {
    				startSelling();
    			} else if (mod.settings.autoDismantling && !dismantling) {
    				startDismantling();
    			} else {
    				command.message("Full inventory and no auto dismantling or auto selling. Stoping...");
    			}
    		} else if (msg.id === 'SMT_ITEM_CANT_POSSESS_MORE' && msg.tokens && msg.tokens['ItemName'] === '@item:204052') {
    			cannotDismantle = true;
    		}
    	}
    });

    mod.hook('C_CHAT', 1, event => {
    	if (event.channel === 10 && mod.settings.enabled) {
    		return false;
    	}
    });
}

// TerableCoder 3/30
/*let Readable;
try {
    ({Readable} = require('tera-data-parser/lib/protocol/stream')); 
} catch (e){
    ({Readable} = require('tera-data-parser/protocol/stream'));
}*/
// TODO make logging write to a file
mod.game.initialize('inventory');

const CRAFTABLE_BAITS = [
	{name: "Bait II", itemId: 206001, abnormalityId: 70272, recipeId: 204100, wormId: 206006, wormAbnormalityId: 70282},
	{name: "Bait III", itemId: 206002, abnormalityId: 70273, recipeId: 204101, wormId: 206007, wormAbnormalityId: 70283},
	{name: "Bait IV", itemId: 206003, abnormalityId: 70274, recipeId: 204102, wormId: 206008, wormAbnormalityId: 70284},
	{name: "Bait V", itemId: 206004, abnormalityId: 70275, recipeId: 204103, wormId: 206009, wormAbnormalityId: 70285}
];
const BAITS = {
	70272: 206001, // Bait II 20%
	70273: 206002, // Bait III 40%
	70274: 206003, // Bait IV 60%
	70275: 206004, // Bait V 80%
	70282: 206006, // Green Angleworm 20%
	70283: 206007, // Blue Angleworm 40%
	70284: 206008, // Purple Angleworm 60%
	70285: 206009 // Golden Angleworm 80%
};
const BAIT_RECIPES = {
	70272: 204100, // Bait II 20%
	70273: 204101, // Bait III 40%
	70274: 204102, // Bait IV 60%
	70275: 204103, // Bait V 80%
	70282: 204100, // Green Angleworm 20%
	70283: 204101, // Blue Angleworm 40%
	70284: 204102, // Purple Angleworm 60%
	70285: 204103 // Golden Angleworm 80%
};

const RODS = [206700, 206701, 206702, 206703, 206704, 206705, 206706, 206707, 206708, 206709, 206710, 206711, 206712, 206713, 206714, 206715, 206716, 206717, 206718, 206719, 206720, 206721, 206722, 206723, 206724, 206725, 206726, 206727, 206728];
const WormId = [206005, 206006, 206007, 206008, 206009];
const saladId = 206020;
const saladAbnormalityId = 70261;
const AnglerToken = 204051;
const SkillTome = [209901, 209902, 209903, 209904];
const TEMPLATE_BANKER = 1962;
const FILET_ID = 204052;

module.exports = function TerableFishing(mod){
	const command = mod.command || mod.require.command;
	
	/*if(mod.proxyAuthor !== 'caali'){
		const options = require('./module').options
		if(options){
			const settingsVersion = options.settingsVersion
			if(settingsVersion){
				mod.settings = require('./' + (options.settingsMigrator || 'module_settings_migrator.js'))(mod.settings._version, settingsVersion, mod.settings)
				mod.settings._version = settingsVersion
			}
		}
	}*/

    let currentBait = null,
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
		useSalad = false,
		checkingBait = false;

	let hasNego = mod.manager.isLoaded('auto-nego'),
		notifier = mod.manager.isLoaded('notifier') ? ( mod.require ? mod.require.notifier : require('tera-notifier')(mod) ) : false,
		pendingDeals = [],
		negoWaiting = false,
		timeout = null,
		amFishing = false,
		retryNumber = 0,
		stopFishing = false,
		consoleMsg = false,
		statFishedTiers = {},
		skillTomeTiers = {},
		startTime = null,
		throwTime = null,
		numThrows = 0,
		scrollsInCooldown = false,
		needToBank = false,
		banking = false,
		skill = {
			reserved: 0,
			npc: false,
			type: 1,
			huntingZoneId: 0,
			id: 60401306
		},
		request = {};

	let counter = 0,
		myServant = null,
		useItemType = 206049, // puppy figurine
		feedServant = false;

    function rand([min, max], lowerBound){
		lowerBound = isNaN(lowerBound) ? Number.NEGATIVE_INFINITY : lowerBound;
		min = parseInt(min);
		max = parseInt(max);
		if(isNaN(min) || isNaN(max)) return lowerBound;

		const result = Math.floor(Math.random() * (max - min + 1)) + min;
		return result >= lowerBound ? result : lowerBound;
    }

    function validate(value, lowerBound, upperBound, defaultValue){
		value = parseInt(value);
		if(isNaN(value)) return defaultValue;
		if(value < lowerBound) return lowerBound;
		if(value > upperBound) return upperBound;
		return value;
    }
	
	function timeStamp(msg){
		let timeNow = new Date();
		let timeText = timeNow.getHours().toLocaleString(undefined, {minimumIntegerDigits: 2}) + ':' +
			timeNow.getMinutes().toLocaleString(undefined, {minimumIntegerDigits: 2}) + ':' + 
			timeNow.getSeconds().toLocaleString(undefined, {minimumIntegerDigits: 2});
		return ("[" + timeText + "] ");
	}
	
	command.add(['tf', 'ef'], {
		$none(){
			mod.settings.enabled = !mod.settings.enabled;
			command.message(`Terable fishing is now ${mod.settings.enabled ? "enabled" : "disabled"}.`);
			mod.saveSettings();
		},
		craft(){
			mod.settings.autoCrafting = !mod.settings.autoCrafting;
			command.message(`Auto bait crafting is now ${mod.settings.autoCrafting ? "enabled" : "disabled"}.`);
			mod.saveSettings();
		},
		delay(){
			mod.settings.useRandomDelay = !mod.settings.useRandomDelay;
			command.message(`Random delay is now ${mod.settings.useRandomDelay ? "enabled" : "disabled"}.`);
			mod.saveSettings();
		},
		distance(value){
			mod.settings.castDistance = validate(value, 0, 18, 3);
			command.message(`Cast distance set to ${mod.settings.castDistance}.`);
			mod.saveSettings();
		},
		discard(amount){ // making this false will swap you between auto sell and discarding
			amount = parseInt(amount);
			if(isNaN(amount)){
				mod.settings.discardFilets = !mod.settings.discardFilets;
				command.message(`Discard filets is now ${mod.settings.discardFilets ? "enabled" : "disabled"}.`);
			} else{
				mod.settings.discardCount = amount;
				command.message(`Discard filets count set to ${mod.settings.discardCount}.`);
			}
			mod.saveSettings();
		},
		bankf(){ // only works while dismantling
			mod.settings.bankFilet = !mod.settings.bankFilet;
			command.message(`Bank Filet is now ${mod.settings.bankFilet ? "enabled" : "disabled"}.`);
			mod.saveSettings();
		},
		dismantle(){
			dismantleSellCommand();
		},
		d(){
			dismantleSellCommand();
		},
		sell(){
			dismantleSellCommand();
		},
		s(){
			dismantleSellCommand();
		},
		salad(){
			mod.settings.reUseFishSalad = !mod.settings.reUseFishSalad;
			if(!mod.settings.reUseFishSalad) useSalad = false;
			command.message(`Reuse fish salad is now ${mod.settings.reUseFishSalad ? "enabled" : "disabled"}.`);
			mod.saveSettings();			
		},
		stop(){
			stopFishing = true;
			command.message(`Fishing will stop soon...`);			
		},
		cancel(){ // fk this shit
			/*stopFishing = true;
			command.message(`Fishing will cancel soon...`);
			clearTimeout(timeout);
			if(startTime == null){
				timeout = setTimeout(startFishing, 1000);
			} else{
				timeout = setTimeout(() => {
					startFishing();
					//mod.toServer('C_STOP_FISHING', 1, {});
					stopFishing = false;
					calculateFishCaught();
				}, 1000);
			}*/
		},
		start(){
			if(mod.settings.autoSelling && (!lastContact.gameId || !lastDialog.id)){
				mod.toClient('S_CHAT', 3, { channel: 21, name: 'TF', message: "You have auto selling turned on, but you didn't talk to any NPC. It will NOT auto sell!!!!"});
			}
			statFishedTiers = {};
			skillTomeTiers = {};
			skillTomeTiers[1] = 0;
			skillTomeTiers[2] = 0;
			skillTomeTiers[3] = 0;
			skillTomeTiers[4] = 0;
			stopFishing = false;
			startTime = new Date().getTime();
			command.message(`Fish logging started.`);
			if(!amFishing){
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 1000);
			}
		},
		snow(){
			stopFishing = true;
			command.message(`Selling Fish`);	
			startSelling();
		},
		dnow(){
			stopFishing = true;
			command.message(`Dismantling Fish`);	
			startDismantling();
		},
		consoleMsg(){
			consoleMsg = !consoleMsg;
			command.message(`consoleMsg = ${consoleMsg ? "enabled" : "disabled"}.`);
			mod.saveSettings();			
		},
		worm(y){
			if(!y){
				mod.settings.worm = !mod.settings.worm;
				command.message(`Worm-Deleter is now ${mod.settings.worm ? "enabled" : "disabled"}.`);
				mod.saveSettings();
			} else if(isNaN(y) || y < 1){
				command.message(`${y} is an invalid argument. Type something like: ef worms 10`);
			} else{
				mod.settings.X = parseInt(y);
				command.message(`Deleting at ${mod.settings.X} Worms`);
				mod.saveSettings();
			}
		},
		baf(){
			mod.settings.BAF = !mod.settings.BAF;
			command.message(`Keeping BAFs is now ${mod.settings.BAF ? "enabled" : "disabled"}.`);
			mod.saveSettings();
		},
		status(){
			command.message(`Terable fishing is ${mod.settings.enabled ? "enabled" : "disabled"}.`);
			command.message(`Selling ${mod.settings.autoSelling ? "enabled" : "disabled"}.`);
			command.message(`Dismantling ${mod.settings.autoDismantling ? "enabled" : "disabled"}.`);	
			command.message(`Bank Filet ${mod.settings.bankFilet ? "enabled" : "disabled"}.`);	
			command.message(`Discard ${mod.settings.discardCount} Fish Filets ${mod.settings.discardFilets ? "enabled" : "disabled"}.`);
			command.message(`Bait crafting ${mod.settings.autoCrafting ? "enabled" : "disabled"}.`);
			command.message(`Delay ${mod.settings.useRandomDelay ? "enabled" : "disabled"}.`);
			command.message(`Cast distance ${mod.settings.castDistance}.`);
			command.message(`Salad ${mod.settings.reUseFishSalad ? "enabled" : "disabled"}.`);
			command.message(`BAFs ${mod.settings.BAF ? "enabled" : "disabled"}.`);	
			command.message(`Deleting ${mod.settings.worm ? "enabled" : "disabled"} at ${mod.settings.X} worms.`);
		}
    });
	
	function dismantleSellCommand(){
		mod.settings.autoDismantling = !mod.settings.autoDismantling;
		mod.settings.autoSelling = !mod.settings.autoDismantling;
		command.message(`Auto dismantling fish is now ${mod.settings.autoDismantling ? "enabled" : "disabled"}.`);
		command.message(`Auto selling fish is now ${mod.settings.autoSelling ? "enabled" : "disabled"}.`);
		mod.saveSettings();
	}
	
	function calculateFishCaught(){
		//mod.toServer('C_STOP_FISHING', 1, {});
		amFishing = false;
		if(notifier) notifier.messageafk(`Fishing Stopping...`);
		throwTime = null;
		numThrows = 0;
		if(startTime == null) return;
		let ms = new Date().getTime() - startTime;
		startTime = null;
		let totalSeconds = Math.floor(ms / 1000);
		let s = addZero(Math.floor(totalSeconds % 60));
		let m = addZero(Math.floor((totalSeconds / 60) % 60));
		let h = addZero(Math.floor(totalSeconds / 3600));
		
		let statFished = 0;
		let statSkillTomes = 0;
		for (let i in statFishedTiers){
			statFished += statFishedTiers[i];
		}
		for (let i in skillTomeTiers){
			statSkillTomes += skillTomeTiers[i];
		}
		if(statFished == 0){
			command.message('Fished out 0 fish. Time elapsed: ' + (h + ":" + m + ":" + s) + "."); 
			return;
		}
		command.message('Fished out: ' + statFished + ' fishes. Time elapsed: ' + (h + ":" + m + ":" + s) + ". Per fish: " + Math.round(totalSeconds / statFished) + " sec");
		command.message('Fishes: ');
		for (let i in statFishedTiers){
			command.message('Tier ' + i + ': ' + statFishedTiers[i]);
		}
		if(statSkillTomes == 0){
			command.message('Fished out 0 skill tomes.');
		} else{
			command.message('Skill Tomes: ');
			for (let i in skillTomeTiers){
				if(skillTomeTiers[i] > 0) command.message('Tier ' + i + ': ' + skillTomeTiers[i]);
			}
		}
		statFishedTiers = {};
		skillTomeTiers = {};
	}
	
	function addZero(i){
		return (i < 10) ? i = "0" + i : i;
	}
	
	function startCraftingBait(){ // ADDED
		if(!crafting) successCount = 0;
		crafting = true;
		if(BAIT_RECIPES[lastBait] === undefined){
			command.message(`Bait ${lastBait} is invalid. Stopping...`);
			calculateFishCaught();
		} else{
			mod.toServer('C_START_PRODUCE', 1, {
				recipe: BAIT_RECIPES[lastBait],
				unk: 0
			});
		}
    }
	
    function startFishing(){
		if(dismantling || selling){
			timeout = setTimeout(() => {
				dismantling = false;
				selling = false;
				startFishing();
			}, 20000);
			return; // TODO make this a setTimeout so that I can detect my dismantle bugging ~ just block rod throws during it ~ time to test
		}
		if(!throwTime) throwTime = new Date().getTime(); // protect from rod spam
		numThrows++;
		let ms = new Date().getTime() - throwTime;
		let totalSeconds = Math.floor(ms / 1000);
		if(totalSeconds > 60){
			if(numThrows > 11){
				stopFishing = true;
				command.message(`Your rod is spamming, I'm fixing it now.`);	
				if(notifier) notifier.message(`Your rod is spamming, I'm fixing it now.`);
			}
			throwTime = new Date().getTime();
			numThrows = 0;
		}
		
		if(mod.game.me.inCombat){
			command.message('Cannot fish while in combat. Stopping...');
			calculateFishCaught();
		} else if(stopFishing){
			stopFishing = false;
			command.message('Fishing stopped.');
			calculateFishCaught();
		} else if(currentBait === null){
			command.message('Bait Null.');
			calculateFishCaught();
		} else{
			amFishing = true;
			mod.toServer('C_USE_ITEM', 3, { // use rod
				gameId: mod.game.me.gameId,
				id: fishingRod,
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
		}
    }

    function startDismantling(){
		itemsToProcess = [];
		waitingInventory = true;
		dismantling = true;
		mod.toServer('C_SHOW_ITEMLIST', 1, {gameId: mod.game.me.gameId, container: 0, pocket: 0, requested: true });
    }

    function startSelling(){
		if(lastContact.gameId && lastDialog.id){
			itemsToProcess = [];
			waitingInventory = true;
			selling = true;
			mod.toServer('C_SHOW_ITEMLIST', 1, {gameId: mod.game.me.gameId, container: 0, pocket: 0, requested: true });
		} else{
			if(mod.settings.autoDismantling){
				command.message('Failed to start auto sell. Cannot find last merchant npc dialog. Dismantling...');
				startDismantling();
			} else{
				command.message('Failed to start auto sell. Cannot find last merchant npc dialog. Stopping...');
				amFishing = false;
				calculateFishCaught();
			}
		}
    }

    function startDiscarding(){
		discarding = true;
		mod.toServer('C_SHOW_ITEMLIST', 1, {gameId: mod.game.me.gameId, container: 0, pocket: 0, requested: true });
    }
	
	function checkBaitCount(){ // ADDED
		if(stopFishing){
			stopFishing = false;
			command.message('Fishing stopped.');
			calculateFishCaught();
		} else{
			itemsToProcess = [];
			mod.toServer('C_SHOW_ITEMLIST', 1, {gameId: mod.game.me.gameId, container: 0, pocket: 0, requested: true });
			mod.setTimeout(() => {
				const baitInInventory = mod.game.inventory.findInBagOrPockets(Object.values(BAITS));
				if(!baitInInventory){ // if no bait, go make it
					startCraftingBait();
					return;
				}
				mod.toServer('C_USE_ITEM', 3, { // use bait
					gameId: mod.game.me.gameId,
					id: baitInInventory.id,
					dbid: baitInInventory.dbid,
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
				timeout = mod.setTimeout(() => {
					if(currentBait){
						startFishing();
					} else{
						command.message("Failed to auto fish. Stopping...");
						calculateFishCaught();
					}
				}, 1000);
			}, 500);
		}
    }
	
	
    function processItemsToDismantle(){
		if(itemsToProcess.length > 0){
			mod.toServer('C_REQUEST_CONTRACT', 1, {
				type: 90,
				unk2: 0,
				unk3: 0,
				unk4: 0,
				name: "",
				data: Buffer.alloc(0)
			})
		} else{
			dismantling = false;
		}
	}

	function processItemsToSell(){
		if(itemsToProcess.length > 0){
			mod.toServer('C_NPC_CONTACT', 2, lastContact);
			let dialogHook;
			
			clearTimeout(timeout);
			timeout = mod.setTimeout(() => {
				if(dialogHook){
					mod.unhook(dialogHook);
					selling = false;
					if(mod.settings.autoDismantling){
						command.message('Failed to contact npc. Dismantling...');
						startDismantling();
					} else{
						command.message('Failed to contact npc. Stopping...');
						calculateFishCaught();
					}
				}
			}, 5000);

			dialogHook = mod.hookOnce('S_DIALOG', 2, event => {
				mod.clearTimeout(timeout);
				mod.toServer('C_DIALOG', 1, Object.assign(lastDialog, { id: event.id }));
			});
		} else{
			selling = false;
		}
    }
	
	mod.game.on('enter_game', () => { 
		feedServant = false;
		pendingDeals = [];
		negoWaiting = false;
		clearTimeout(timeout);
		amFishing = false;
		retryNumber = 0;
		stopFishing = false;
		fishingRod = null;
		if((mod.settings.autoDismantling && mod.settings.autoSelling) || (!mod.settings.autoDismantling && !mod.settings.autoSelling)){ // don't allow both to be the same
			mod.settings.autoDismantling = true;
			mod.settings.autoSelling = false;
			mod.saveSettings();
		}
    });

	mod.game.on('leave_game', () => {
        pendingDeals = [];
		negoWaiting = false;
		clearTimeout(timeout);
		amFishing = false;
		retryNumber = 0;
		stopFishing = false;
		fishingRod = null;
    });

	mod.hook('C_NPC_CONTACT', 2, event => {
		Object.assign(lastContact, event);
	});

	mod.hook('C_DIALOG', 1, event => {
		Object.assign(lastDialog, event);
	});

	mod.hook('C_CAST_FISHING_ROD', 2, event => {
		//event.dist = validate(mod.settings.castDistance, 0, 18, 3);
		event.castDistance = validate(mod.settings.castDistance, 0, 18, 3);
		return true;
	});

	mod.hook('S_END_PRODUCE', 1, event => {
		if(!crafting) return;
		if(event.success){
			successCount++;
			startCraftingBait();
		} else{
			crafting = false;
			
			if(successCount == 0){
				if(mod.game.inventory.getTotalAmount(204052) < 30 && mod.settings.autoDismantling) { // NEW
					crafting = false;
					mod.setTimeout(startDismantling, 2000);
				} else if(!mod.settings.discardFilets){
					mod.settings.autoSelling = false;
					mod.settings.autoDismantling = true;
					command.message(`You've run out of Fish Filets. Auto selling fish is now disabled. Auto dismantling fish is now enabled.`);
					startDismantling();
				} else{
					command.message("Failed to auto craft. Stopping...");
					calculateFishCaught();
				}
			} else{
				mod.toServer('C_SHOW_ITEMLIST', 1, {gameId: mod.game.me.gameId, container: 0, pocket: 0, requested: true });
				mod.setTimeout(() => {
					const baitInInventory = mod.game.inventory.findInBagOrPockets(Object.values(BAITS));
					mod.toServer('C_USE_ITEM', 3, { // use bait
						gameId: mod.game.me.gameId,
						id: baitInInventory.id,
						dbid: baitInInventory.dbid,
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
						if(currentBait){
							startFishing();
						} else{
							command.message("Failed to auto fish. Stopping...");
							calculateFishCaught();
						}
					}, 1000);
				}, 500);
			}
		}
	});

	mod.hook('S_REQUEST_CONTRACT', 1, event => {
		if(dismantling || selling){
			if(event.type == 90){
				const handleContract = () => {
					let delay = mod.settings.useRandomDelay ? rand(mod.settings.moveItemDelay, 200) : 200;

					for (let item of itemsToProcess.slice(0, 20)){
						timeout = mod.setTimeout(() => {
							if(cannotDismantle) return;

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
							if(cannotDismantle){
								itemsToProcess = [];
								cannotDismantle = false;
								dismantling = false;

								mod.toServer('C_CANCEL_CONTRACT', 1, {
									type: 90,
									id: event.id
								});

								if(mod.settings.bankFilet){
									clearTimeout(timeout);
									timeout = setTimeout(startBanking, 2000);
								} else if(mod.settings.discardFilets && mod.settings.discardCount > 0){
									clearTimeout(timeout);
									timeout = setTimeout(startDiscarding, 2000);
								} else{
									clearTimeout(timeout);
									timeout = mod.setTimeout(() => {
										mod.settings.autoDismantling = false;
										mod.settings.autoSelling = true;
										command.message(`Max Fishing Filets Reached. Auto selling fish is now enabled. Auto dismantling fish is now disabled.`);
										startSelling();
									}, 2000);
								}
								return;
							}

							if(itemsToProcess.length > 0){
								handleContract();
							} else{
								dismantling = false;

								mod.toServer('C_CANCEL_CONTRACT', 1, {
									type: 90,
									id: event.id
								});
								clearTimeout(timeout);
								timeout = setTimeout(checkBaitCount, 2000);
							}
						}, 3000);
					}, delay+50);
				};
				handleContract();
			} else if(event.type === 9){
				if(itemsToProcess.length > 0){
					let delay = mod.settings.useRandomDelay ? rand(mod.settings.moveItemDelay, 200) : 200;

					for (let item of itemsToProcess.slice(0, 18)){
						timeout = mod.setTimeout(() => {
							mod.toServer('C_STORE_SELL_ADD_BASKET', 2, {
								cid: mod.game.me.gameId,
								npc: event.id,
								item: item.id,
								quantity: 1,
								unk1: 0,
								slot: item.slot
							});
						}, delay);
						delay += mod.settings.useRandomDelay ? rand(mod.settings.moveItemDelay, 200) : 200;
					}
					itemsToProcess = itemsToProcess.slice(18);
					timeout = mod.setTimeout(() => {
						mod.toServer('C_STORE_COMMIT', 1, { gameId: mod.game.me.gameId, contract: event.id });
					}, delay+50);
				} else{
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

    mod.hook('S_ITEMLIST', 3, event => {
		for (const item of event.items){
			if(RODS.includes(item.id)){
				if(fishingRod == null || fishingRod == 206700) fishingRod = item.id;
			}
		}
		
		if(!dismantling && !selling && !discarding && !checkingBait) return;

		if(waitingInventory){
			/*if(checkingBait && currentBait){ // trying to fix the bait off and on
				clearTimeout(timeout);
				timeout = mod.setTimeout(() => {
					startFishing();
					
				}, 1000);
				return;
			}*/
			
			if(selling || dismantling){
				for (const item of event.items){
					if(mod.settings[selling ? "autoSellFishes" : "autoDismantleFishes"].find(id => id == item.id)){
						itemsToProcess.push({dbid: item.dbid, id: item.id, slot: item.slot});
					} else if(mod.settings.worm && WormId.includes(item.id) && item.amount >= mod.settings.X){
						mod.toServer('C_DEL_ITEM', 3, {
							gameId: mod.game.me.gameId,
							pocket: 0,
							slot: (item.slot),
							amount: item.amount
						});
					}
				}
				
				if(mod.settings.BAF){
					itemsToProcess = itemsToProcess.filter(obj => obj.id <= 206500);
				}
				
				if(!event.more){
					waitingInventory = false;
					if(dismantling){
						processItemsToDismantle();
					} else if(selling){
						processItemsToSell();
					}
				}
			}
			
		}

		if(discarding){
			for (const item of event.items){
				if(item.id == 204052){
					discarding = false;
					command.message(`Discarding ${mod.settings.discardCount} filets.`);
					mod.toServer('C_DEL_ITEM', 3, {
						gameId: mod.game.me.gameId,
						pocket: 0,
						slot: item.slot,
						amount: Math.min(item.amount, mod.settings.discardCount)
					});
					clearTimeout(timeout);
					timeout = setTimeout(startFishing, 2000);
					break;
				}
			}

			if(!event.more && discarding){
				discarding = false;
				command.message('Something really weird happened, could not discard filets. Stopping...');
				calculateFishCaught();
			}
		}
    });

	mod.hook('S_FISHING_BITE', 1, event => {
		if (!mod.settings.enabled || !mod.game.me.is(event.gameId)) return;
		
		mod.setTimeout(() => {
			mod.send('C_START_FISHING_MINIGAME', 2, {
				counter: ++counter,
				unk: 268
			});
		}, 537);
    /*mod.hook('S_FISHING_BITE', 'raw', (code, data) => {
        if(!mod.settings.enabled) return;

		retryNumber = 0;
        const stream = new Readable(data);
        stream.position = 8;
        if(mod.game.me.is(stream.uint64())){
            mod.toServer('C_START_FISHING_MINIGAME', 1, {});
        }*/
    });

	mod.hook('S_CAST_FISHING_ROD', 1, event => {
		if (!mod.settings.enabled || !mod.game.me.is(event.gameId)) return;
		
		fishingRod = event.fishingRod;
	/*mod.hook('S_CAST_FISHING_ROD', 'raw', (code, data) => {
        const stream = new Readable(data);
        stream.position = 4;
        if(mod.game.me.is(stream.uint64())){
			stream.position = 25;
			fishingRod = stream.uint32();
        }*/
    });
	
	mod.hook('S_SYSTEM_MESSAGE_LOOT_ITEM', 1, event => {
		if(!mod.settings.enabled) return;
		
		if(SkillTome.includes(event.item)){
			let STindex = event.item % 10; // skill tome level = 1/2/3/4
			skillTomeTiers[STindex]++;
		}
		if(event.item == AnglerToken){
			let fishTier = -1;
			switch(event.amount){
			 case 30: fishTier = 11; break;
			 case 15: fishTier = 10; break;
			 case 12: fishTier = 9; break;
			 case 10: fishTier = 8; break;
			 case 8: fishTier = 7; break;
			 case 6: fishTier = 6; break;
			 case 4: fishTier = 5; break;
			 case 2: fishTier = 4; break; // 3/4
			 case 1: fishTier = 2; break; // 1/2
			}
			statFishedTiers[fishTier] = statFishedTiers[fishTier] ? statFishedTiers[fishTier]+1 : 1;
		}
	});
	
	mod.hook('S_START_FISHING_MINIGAME', 1, event => {
		if (!mod.settings.enabled || !mod.game.me.is(event.gameId)) return;

		mod.setTimeout(() => {
			mod.clearAllTimeouts();
			mod.send('C_END_FISHING_MINIGAME', 2, {
				counter: counter,
				unk: 138,
				success: true
			});
		}, mod.settings.useRandomDelay ? rand(mod.settings.catchDelay, 2000) : 2000);
		return false;
    /*mod.hook('S_START_FISHING_MINIGAME', 'raw', (code, data) => {
        if(!mod.settings.enabled) return;
		
        const stream = new Readable(data);
        stream.position = 8;
        if(mod.game.me.is(stream.uint64())){
			clearTimeout(timeout);
            timeout = mod.setTimeout(() => {
                mod.toServer('C_END_FISHING_MINIGAME', 1, {
                    success: true
                });
            }, mod.settings.useRandomDelay ? rand(mod.settings.catchDelay, 2000) : 2000);
            return false;
        }*/
    });
	
    mod.hook('C_USE_ITEM', 3, event => {
		if(RODS.includes(event.id)){
			if(pendingDeals.length){
				command.message("Dealing with negotiations.");
				negoWaiting = true;
				for(let i = 0; i < pendingDeals.length; i++){
					mod.toClient('S_TRADE_BROKER_DEAL_SUGGESTED', 1, pendingDeals[i]);
					pendingDeals.splice(i--, 1);
				}
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 18000);
				return false;
			}
			
			if(stopFishing){
				command.message("Fishing stopped.");
				stopFishing = false;
				calculateFishCaught();
				return false;
			}
			if(mod.game.me.inCombat){
				command.message('Cannot fish while in combat. Stopping...');
				calculateFishCaught();
				return false;
			}
			
			if(feedServant){
				feedServant = false;
				const useItem = mod.game.inventory.find(useItemType);
				if(useItem){
					mod.send('C_USE_ITEM', 3, {
						gameId: mod.game.me.gameId,
						id: useItem.id,
						dbid: useItem.dbid,
						target: 0n,
						amount: 1,
						dest: {x: 0, y: 0, z: 0},
						loc: playerLocation,
						w: playerAngle,
						unk1: 0,
						unk2: 0,
						unk3: 0,
						unk4: true
					});
					clearTimeout(timeout);
					timeout = setTimeout(startFishing, 1000);
					return false;
				}
			}
			if(useSalad){
				mod.toServer('C_USE_ITEM', 3, {
					gameId: mod.game.me.gameId,
					id: saladId,
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
				useSalad = false;
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 1000);
				return false;
			}
			negoWaiting = false;
			amFishing = true;

			if(mod.settings.autoSelling && (!lastContact.gameId || !lastDialog.id)){
				mod.toClient('S_CHAT', 3, { channel: 21, name: 'TF', message: "You have auto selling turned on, but you didn't talk to any NPC. It will NOT auto sell!!!!"});
			}
		}
	});

	mod.hook('C_PLAYER_LOCATION', 5, event => {
		Object.assign(playerLocation, event.loc);
		playerAngle = event.w;
	});
	
	mod.hook('S_SPAWN_ME', 3, event => {
        Object.assign(playerLocation, event.loc);
        playerAngle = event.w;
    });

    mod.hook('S_ABNORMALITY_BEGIN', 3, event => {
		if(mod.game.me.is(event.target)){
			if(event.id === saladAbnormalityId) useSalad = false;
			//currentBait = CRAFTABLE_BAITS.find(obj => obj.abnormalityId === event.id) || currentBait;
			currentBait = Object.keys(BAITS).includes((event.id).toString()) ? event.id : currentBait;
			lastBait = currentBait || lastBait;
		}
	});

	mod.hook('S_ABNORMALITY_REFRESH', 1, event => {
		if(mod.game.me.is(event.target) && event.id === 70261) useSalad = false;
	});

	mod.hook('S_ABNORMALITY_END', 1, event => {
		if(!mod.game.me.is(event.target)) return;

		if(currentBait === event.id && amFishing){
			currentBait = null;
			clearTimeout(timeout);
			setTimeout(() => { // ADDED
				checkBaitCount();
			}, 5000);
		} else if(event.id === 70261 && mod.settings.reUseFishSalad){ 
			useSalad = true;
		}
    });

    mod.hook('S_SYSTEM_MESSAGE', 1, event => {
		if(consoleMsg){
			let tempMsg = mod.parseSystemMessage(event.message);
			console.log(timeStamp() + "Logged Message");
			console.log(tempMsg);
		}
		if(!mod.settings.enabled || (!amFishing && startTime == null)) return;
		
		const msg = mod.parseSystemMessage(event.message);
		if(msg){
			/*case 'SMT_ITEM_USED_ACTIVE':
				if (currentBait && !fishingRod) {
					MSG.chat(MSG.TIP("已激活 ") + mod.game.inventory.find(currentBait.itemId).data.name + MSG.BLU(" 模组开启"));
					mod.settings.enabled = true;
				}
				break;
			case 'SMT_ITEM_USED_DEACTIVE':
				if (lastUsedBait) {
					MSG.chat(MSG.RED("已冻结 ") + mod.game.inventory.find(lastUsedBait.itemId).data.name + MSG.YEL(" 模组关闭"));
					mod.settings.enabled = false;
					restStatus();
				}
				break;*/
			if(msg.id === 'SMT_CANNOT_FISHING_FULL_INVEN'){ // full inven
				if(mod.settings.autoSelling && !selling && !dismantling){
				//if(mod.settings.autoSelling){
					startSelling();
				} else if(mod.settings.autoDismantling && !dismantling && !selling){
				//} else if(mod.settings.autoDismantling){
					startDismantling();
				}
			} else if(msg.id === 'SMT_ITEM_CANT_POSSESS_MORE' && msg.tokens && msg.tokens['ItemName'] === '@item:204052'){ // too many fish filets
				cannotDismantle = true;
			} // CAN REMOVE START?
			else if(msg.id === 'SMT_CANNOT_FISHING_NON_AREA' && !negoWaiting){ // non-fishing area bug
				command.message("Non-fishing area bug? Retrying.");
				clearTimeout(timeout);
				retryNumber++;
				if(!stopFishing && retryNumber < 4){
					timeout = setTimeout(startFishing, 3000);
				} else{
					command.message("Fishing area couldn't be found. Stopping...");
					retryNumber = 0;
					calculateFishCaught();
				}
			} else if(msg.id === 'SMT_PROHIBITED_ACTION_ON_RIDE' && !negoWaiting){ // mounted
				command.message("Can't fish while mounted. Retrying.");
				clearTimeout(timeout);
				retryNumber++;
				if(!stopFishing && retryNumber < 3){
					timeout = setTimeout(startFishing, 3000);
				} else{
					command.message("Can't fish while mounted. Stopping...");
					retryNumber = 0;
					calculateFishCaught();
				}
			} else if(msg.id === 'SMT_BATTLE_SKILL_FAIL_COOL_TIME' || msg.id === 'SMT_SKILL_CANNOT_USE_ONCOMBAT'){ // using skill while trying to throw rod
				command.message("Can't fish while using a skill. Retrying.");
				clearTimeout(timeout);
				retryNumber++;
				if(!stopFishing && retryNumber < 2){
					timeout = setTimeout(startFishing, 3000);
				} else{
					command.message("Can't fish while using a skill. Stopping...");
					retryNumber = 0;
					calculateFishCaught();
				}
			} else if(msg.id === 'SMT_FISHING_RESULT_CANCLE' && stopFishing && !pendingDeals.length){ // intentionally stopping
				command.message("Fishing stopped.");
				stopFishing = false;
				calculateFishCaught();
			} else if(msg.id === 'SMT_FISHING_RESULT_CANCLE' && !pendingDeals.length){ // cancelled?
				command.message("Fishing cancelled. Retrying.");
				clearTimeout(timeout); // TODO SEE IF I CAN REMOVE THIS
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
						calculateFishCaught();
						clearTimeout(timeout);
						timeout = setTimeout(() => {
							command.message("Fishing stopped.");
						}, 9000);
					} else{
						clearTimeout(timeout);
						timeout = setTimeout(startFishing, 9000);
					}
				}
			} else if(msg.id === 'SMT_YOU_ARE_BUSY'){ // being party invited, traded, etc.
				command.message("You're busy. Retrying.");
				clearTimeout(timeout); // TODO SEE IF I CAN REMOVE THIS
				timeout = setTimeout(startFishing, 3000);
			} // CAN REMOVE END?
			else if(negoWaiting && !pendingDeals.length && msg.id === 'SMT_MEDIATE_SUCCESS_SELL'){ // finished all negotiations
				negoWaiting = false;
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 1000);
			} else if(msg.id === 'SMT_CANNOT_USE_ITEM_WHILE_CONTRACT'){ // still negotiating
				negoWaiting = true;
				clearTimeout(timeout);
				timeout = setTimeout(startFishing, 9000);
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
			command.message("Negotiation suggested, I'll address it after this fish.");
			return false;
		}
	});
	
    mod.hook('C_CHAT', 1, event => {
	if(event.channel === 10 && mod.settings.enabled) return false;
	});
	
	// Banking fillets
    function startBanking(){
		if(scrollsInCooldown){
			needToBank = true;
		} else{
			needToBank = false;
			banking = true;
			mod.toServer('C_NOTIMELINE_SKILL', 3, { skill: skill });
		}
    }
	function bankFilets() {
		let filets = mod.game.inventory.findInBagOrPockets(FILET_ID);
		mod.send('C_PUT_WARE_ITEM', 3, {
			gameId: mod.game.me.gameId,
			type: 1,
			page: 0,
			pocket: filets.pocket,
			invenPos: filets.slot,
			id: filets.id,
			dbid: filets.dbid,
			amount: filets.amount
		});
		
		mod.setTimeout(() => {
			mod.send('C_CANCEL_CONTRACT', 1, {
				type: 26,
				id: request.banker.id
			});
			banking = false;
			clearTimeout(timeout);
			timeout = setTimeout(startFishing, 2000);
		}, 5000);
	}
	mod.hook('S_START_COOLTIME_SKILL', 3, event => {
		if(event.skill == skill && event.cooldown > 0){
			scrollsInCooldown = true;
			setTimeout(() => {
				scrollsInCooldown = false;
				if(needToBank) startBanking();
			}, event.cooldown);
		}
	});
	mod.hook('S_SPAWN_NPC', 11, event => {
		if(banking && event.relation == 12 && event.templateId == TEMPLATE_BANKER && mod.game.me.is(event.owner)){
			request.banker = event;
			mod.setTimeout(() => {
				mod.send('C_NPC_CONTACT', 2, {
					gameId: request.banker.gameId
				});
			}, 3427);
		}
	});
	mod.hook('S_DIALOG', 2, event => {
		if(banking && request.banker && event.gameId == request.banker.gameId){
			request.banker.dialogId = event.id;
			mod.setTimeout(() => {
				mod.send('C_DIALOG', 1, {
					id: request.banker.dialogId,
					index: 1,
					questReward: -1,
					unk: -1
				});
			}, 2381);
		}
	});
	mod.hook('S_REQUEST_CONTRACT', 1, event => {
		if(banking && event.type == 26){
			request.banker.id = event.id;
			bankFilets();
		}
	});

	
	mod.hook('S_REQUEST_SPAWN_SERVANT', 4, event => {
		if (!mod.game.me.is(event.ownerId) || event.spawnType != 0) return;
		myServant = event;
		if(100 * event.energy / event.energyMax < 60 && event.type == 1){
			feedServant = true;
		}
	});
	
	mod.hook('S_REQUEST_DESPAWN_SERVANT', 1, event => {
		if(!myServant || myServant.gameId != event.gameId || event.despawnType != 0) return;
		myServant = null;
	});
	
	mod.hook('S_UPDATE_SERVANT_INFO', 2, event => {
		if(!myServant || myServant.dbid != event.dbid || myServant.id != event.id) return;
		if(100 * event.energy / event.energyMax < 60 && event.type == 1){
			feedServant = true;
		}
	});
	

	/*
	mod.hook('S_VIEW_WARE_EX', 1, event => {
		if (!mod.settings.enabled || !mod.game.me.is(event.gameId)) return;
		
		wareExtend = event;
	});
	
	function startGettingBait() {
		if (!myServant) {
			mod.setTimeout(startSpawning, 5000);
		} else {
			mod.setTimeout(startGetWare, 5000);
		}
	}
	
	function startSpawning() {
		if (log) MSG.chat(MSG.RED("------开启[自动召唤]系统------"));
		spawning = true;
		mod.send('C_REQUEST_SERVANT_INFO_LIST', 1, {
			gameId: mod.game.me.gameId
		});
	}
	
	function startGetWare() {
		if (log) MSG.chat(MSG.RED("------开启[个人仓库]搜寻------[鱼饵]"));
		mod.send('C_SERVANT_ABILITY', 1, {
			gameId: myServant.gameId,
			skill: myServant.abilities.find(obj => (obj.id == 22 || obj.id == 23)).id
		});
		
		mod.setTimeout(startGetWareItem, 5000);
	}
	
	function startGetWareItem() {
		var baitIDs = [];
		for (let item of CRAFTABLE_BAITS) {
			baitIDs.push(item.itemId);
		}
		
		var scanningBait;
		
		for (let baitID of baitIDs) {
			if (scanningBait = wareExtend.items.find(item => item.id == baitID)) break;
		}
		
		if (scanningBait) {
			var maxGetBaitAmount = CRAFTABLE_BAITS.find(obj => obj.itemId == scanningBait.id).maxAmount;
			mod.send('C_GET_WARE_ITEM', 3, {
				gameId: mod.game.me.gameId,
				type: wareExtend.type,
				page: wareExtend.offset,
				gold: 0,
				bankSlot: scanningBait.amountTotal,
				dbid: scanningBait.dbid,
				id: scanningBait.id,
				amont: ((scanningBait.amount < maxGetBaitAmount) ? scanningBait.amount : maxGetBaitAmount),
				invenPocket: -1,
				invenSlot: -1
			});
			MSG.chat(MSG.YEL("~提取鱼饵~ ") + "成功");
			
			mod.setTimeout(() => {
				// MSG.chat(MSG.RED("------关闭[个人仓库]------"));
				// mod.send('S_VIEW_WARE_EX', 1, {
					// gameId: mod.game.me.gameId,
					// action: 1
				// });
				
				if (log) MSG.chat(MSG.YEL("~解除召唤~ ") + "宠物/伙伴");
				mod.send('C_REQUEST_DESPAWN_SERVANT', 1, {});
				
				mod.setTimeout(activeBait, 5000);
			}, 2000);
			return;
		} else if ((wareExtend.offset+72) < wareExtend.slots) {
			if (log) MSG.chat(MSG.YEL("~切换分页~ ") + MSG.YEL("...重新搜寻"));
			mod.send('C_VIEW_WARE', 2, {
				gameId: mod.game.me.gameId,
				type: 9,
				offset: (wareExtend.offset+72)
			});
			
			mod.setTimeout(startGetWareItem, 2000);
		} else {
			MSG.party("未找到[鱼饵], 已关闭自动[提取]功能!!!");
			if (log) MSG.chat(MSG.YEL("~解除召唤~ ") + "宠物/伙伴");
			mod.send('C_REQUEST_DESPAWN_SERVANT', 1, {});
			mod.settings.autoGetting = false;
			
			mod.setTimeout(activeBait, 5000);
		}
	}
	*/
}

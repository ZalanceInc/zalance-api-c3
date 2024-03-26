let stripe = null;
const C3 = self.C3;

// NOTE: use a unique DOM component ID to ensure it doesn't clash with anything else.
const DOM_COMPONENT_ID = "ZalanceAPI";
const API_PUBLIC_DOMAIN = 'https://x8ki-letl-twmt.n7.xano.io/api:Kp9D5gmw';
const API_WS_DOMAIN = 'wss://realtime.ably.io?key=uXZHPA.morNBQ:spIwqa7KLhYxhwvbZmG_KHYiG5dCHZQ33Z-ue2ToQwI';
const API_PRICES_GET = API_PUBLIC_DOMAIN + '/price/{project_uuid}';
const API_SESSION_CREATE = API_PUBLIC_DOMAIN + '/session';
const STRIPE_PK_TEST = 'pk_test_51Nesh1JrymnyTJpQTlgXBIsaej7qYWHF5geTgUx7hl67PFxljYb6A5TLY3FmLStY85CI5vb7e5VFzHF71z9gxt4X00AHmd9oUo';
const STRIPE_PK_LIVE = 'pk_live_51Nesh1JrymnyTJpQuGlhol6j7QzZlpaiHPwWoLfum9HnR42AN3J6EJnWGETuLRHbRootbE1hJXS0HtxwE8PnGlzt007zYVjMrw';

const GetConfig = () => {
    const config = {
        method: 'GET',
        headers: undefined,
        body: undefined,
        // credentials: 'include',
        redirect: 'follow',
    };

    return config;
};

const UrlPathReplace = (path, params, isLocalParam = false) => {
    const exp = isLocalParam ? /:\w+/g : /{\w+}/g;

    const result = path.replace(exp, (placeholder) => {
        const length = isLocalParam ? placeholder.length : placeholder.length - 1;
        return params[placeholder.substring(1, length)] || placeholder;
    });

    return result;
};

class MMWebSocket {
    constructor(mmPaymentInst)
	{
        this._mmPaymentInst = mmPaymentInst;
        this._ws = null;
        this._channel = null;
        this._errorMsg = "";
        this._messageBinary = null;
        this._closeCode = 0;
        this._closeReason = "";
    }

    ConnectWS(url, channel, purchaseCallback, requireProtocol = false) {
        if (this._ws) {
            this._ws.close();
        }

        if(!channel) {
            return;
        }

        try {
            if (requireProtocol) {
                this._ws = new WebSocket(url, requireProtocol);
            }
            else {
                this._ws = new WebSocket(url);
            }
        } catch (err) {
            this._ws = null;
            this._errorMsg = "Unable to create a WebSocket with the given address and protocol.";
            this._mmPaymentInst.Trigger(C3.Plugins.ZalanceAPI.Cnds.OnError);
            return;
        }

        const ws = this._ws;
        this._channel = channel;
        ws.binaryType = "arraybuffer";

        return new Promise((resolve) => {
            ws.onopen = async() => {
                if (requireProtocol?.length && !ws.protocol.includes(requireProtocol)) {
                    this._errorMsg = "WebSocket required protocol '" + requireProtocol + "' not supported by server";
                    await this._mmPaymentInst.TriggerAsync(C3.Plugins.ZalanceAPI.Cnds.OnError)
                } 
                else {
                    
                }

                resolve();
            };

            ws.onerror = async err => {
                if (typeof err === "string")
                    this._errorMsg = err;
                else
                    this._errorMsg = err && typeof err.data === "string" ? err.data : "";
                resolve();
            };

            ws.onclose = async e => {
                this._closeCode = e["code"] || 0;
                this._closeReason = e["reason"] || "";
                this._ws = null;
                this._channel = null;
            };

            ws.onmessage = async msg => {
                const data = msg.data;
                if (typeof data === "string") {
                    console.log(`[Zalance] websocket: `, data);
                    const recvMsg = JSON.parse(data);

                    // Connected - Passed by the service back to a client to signify that a connection request has succeeded
                    if(recvMsg?.action === 4) {
                        // Connect to the payment channel which is named with session id
                        console.log(`[Zalance] request attach to channel ${channel}`);
                        const msg = JSON.stringify({ "action": 10, "channel": this._channel });
                        this._ws.send(msg);
                        await this._mmPaymentInst.TriggerAsync(C3.Plugins.ZalanceAPI.Cnds.OnOpened);
                    }

                    if(purchaseCallback && recvMsg?.action === 15 && recvMsg?.messages?.length > 0) {
                        const msg = recvMsg.messages[0];
                        const msgObj = JSON.parse(msg.data);
                        await purchaseCallback(msgObj);
                    }

                    await this._mmPaymentInst.TriggerAsync(C3.Plugins.ZalanceAPI.Cnds.OnMessage);
                }
                else if (data && data instanceof ArrayBuffer) {
                    this._messageBinary = data;
                    await this._mmPaymentInst.TriggerAsync(C3.Plugins.ZalanceAPI.Cnds.OnBinaryMessage);
                    this._messageBinary = null;
                } 
                else {
                    console.warn(`[Construct] Unknown WebSocket message data: `, data);
                }
            }
        });
    }

    Disconnect() {
        if (!this._ws) {
            return;
        }

        if(this._ws.readyState !== WebSocket.CLOSED) {
            console.log(`[Zalance] closing connection`);
            const msg = JSON.stringify({ "action": 7 });
            this._ws.send(msg);
        }
    }

    Close() {
        if (!this._ws) {
            return;
        }

        this.Disconnect();

        this._ws.close();
        this._ws = null;
        this._channel = null;
    }

    Send(msg) {
        if (!this._ws || this._ws.readyState !== 1) {
            return;
        }

        this._ws.send(msg);
    }

    SendBinary(objectClass, inst) {
        if (!this._ws || this._ws.readyState !== 1) {
            return;
        }

        if (!objectClass) {
            return;
        }

        const target = objectClass.GetFirstPicked(inst);
        if (!target) {
            return;
        }

        const sdkInst = target.GetSdkInstance();
        const buffer = sdkInst.GetArrayBufferReadOnly();
        this._ws.send(buffer)
    }
}

const MAX_PRICE_COUNT = 50;

C3.Plugins.ZalanceAPI.Instance = class ZalanceAPIInstance extends C3.SDKInstanceBase
{
	constructor(inst, properties)
	{
		super(inst);
		
		// Keep a copy of the button text on the instance, so it can be returned from an expression.
        this._projectId = '00000000-0000-0000-0000-000000000000';
        this._livemode = false;
		this._prices = [];
        this._cart = [];
        this._curPricePage = 1;
        this._nextPricePage = 0;
        this._accountId = null;
        this._sessionId = null;
        this._isPurchased = false;
        this._errorMsg = "";
        this._triggerPricesReceived = false;
        this._triggerCheckoutStart = false;
        this._triggerCheckoutFinish = false;
        this._triggerError = false;
        this._checkout = null;
        this._checkoutIframe = null;
        this._mmWS = new MMWebSocket(this);

		if (properties)
		{
            this._projectId = properties[0];
            this._livemode = properties[1];
		}
	}
	
	Release()
	{
		super.Release();
	}

	RequestPrices() 
	{
		// Trigger a runtime event so Zalance can make a purchase request
        const event = new C3.Event("zalance_prices_request", true)
        this._runtime.Dispatcher().dispatchEvent(event);
	}

    async _GetPrices(count, page) {
        try {
            let url = UrlPathReplace(API_PRICES_GET, {
                "project_uuid": this._projectId
            });

            let config = GetConfig();
            config.method = 'POST';
            config.headers = new Headers();
            config.headers.append("Content-Type", "application/json");

            const inputs = this.SanitizePriceInputs(count, page);

            // Format keys as strings for minification support
            config.body = JSON.stringify({
                "count": inputs.count,
                "page": inputs.page,
                "livemode": this._livemode
            });

            console.log('getting prices', config.body);
    
            const response = await fetch(url, config);
            if (response?.status === 200) {
                const data = await response.json();
                this._UpdatePrices(data["items"]);
                this._curPricePage = data.curPage;
                this._nextPricePage = data.nextPage;
                this._triggerPricesReceived = true;
                this.Trigger(C3.Plugins.ZalanceAPI.Cnds.OnPricesReceived);
            }
            else {
                console.error(`Error requesting prices. Status ${response.status}`, response);
            }
        } catch (err) {
            console.error("Error requesting prices", err);
        }
    };

    _UpdatePrices(prices) {
        if(!prices || !Array.isArray(prices)) {
            this._prices = [];
            return;    
        }

        this._prices = prices.map((price) => {
            // Add a localized display amount to the price. 
            // Use string key for minification
            let unit_amount = price["unit_amount"];

            switch(price.currency.iso) {
                case 'BIF':
                case 'CLP':
                case 'DJF':
                case 'GNF':
                case 'JPY':
                case 'KMF':
                case 'KRW':
                case 'MGA':
                case 'PYG':
                case 'RWF':
                case 'UGX':
                case 'VND':
                case 'VUV':
                case 'XAF':
                case 'XOF':
                case 'XPF':
                    break;

                default:
                    unit_amount *= 0.01;
            }

            // Use string key for minification
            price["display_amount"] = new globalThis["Intl"]
                ["NumberFormat"](
                    'en-US', 
                    { "style": 'currency', "currency": price["currency"]["iso"] })
                .format(unit_amount);
            
            return price;
        })
    }

    async _CreateCheckoutSession(price_id, quantity, automatic_tax) {
        const lineItems = [
            {
                "price": price_id,
                "quantity": quantity
            }
        ]

        await this._CreateCheckoutSessionItems(lineItems, automatic_tax);
    }

    async _CreateCheckoutSessionItems(lineItems, automatic_tax) {
        // Clear the current session
        this._sessionId = null;

        try {
            let config = GetConfig();
            config.method = 'POST';
            config.headers = new Headers();
            config.headers.append("Content-Type", "application/json");

            // Format keys as strings for minification support
            config.body = JSON.stringify({
                "project_uuid": this._projectId,
                "account_id": this._accountId,
                "return_url": window.location.href,
                "line_items": lineItems,
                "automatic_tax": automatic_tax,
                "livemode": this._livemode
            });
    
            const response = await fetch(API_SESSION_CREATE, config);
            if (response?.status == 200) {
                const data = await response.json();

                // Parse each parameter separately for minification compatibility
                this._sessionId = data["id"];
                const client_secret = data["client_secret"];

                // Websocket callback on finished
                // this._mmWS.ConnectWS(API_WS_DOMAIN, id, this.OnWSCheckoutFinish.bind(this));
                
                await this._CreateSessionIframe(client_secret);
            }
            else {
                await this._HandleErrorResponse(response);
            }
        } catch (err) {
            console.error("Error creating checkout items.", err);
        }
    };

    async _CreateSessionIframe(client_secret) {
        try {
            this._DestroyCheckoutSession();
            
            const closeBtnEl = document.createElement('button');
            closeBtnEl.type = "button";
            closeBtnEl.textContent = "X";
            closeBtnEl.style = "position: relative; float: right; top: 1.6em; right: 0.2em; border: none; background: none; font-size: 1.6em;"
            closeBtnEl.onclick = () => { this._DestroyCheckoutSession() };
            
            const checkoutEl = document.createElement('div');
            checkoutEl.id="zalance-checkout";

            const divOuterEl = document.createElement('div');
            divOuterEl.style = "width: 1000px";
            divOuterEl.appendChild(closeBtnEl);
            divOuterEl.appendChild(checkoutEl);
            
            this._checkoutIframe = document.createElement('div');
            this._checkoutIframe.style = "position: fixed; left: 0px; top: 0px; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 0.866667em;"
            this._checkoutIframe.appendChild(divOuterEl);

            document.getElementsByTagName('body')[0].appendChild(this._checkoutIframe);

            if(!stripe) {
                // Use globalThis for minification support
                stripe = globalThis["Stripe"](this._livemode? STRIPE_PK_LIVE : STRIPE_PK_TEST);
            }
            
            // Format stripe library function and json keys as string for minification support
            this._checkout = await stripe["initEmbeddedCheckout"]({
                "clientSecret": client_secret,
                "onComplete": this._HandleSessionComplete.bind(this)
            });

            // Mount Checkout
            this._checkout["mount"]('#zalance-checkout');

            // Send start event message
            this.OnCheckoutStart();
        }
        catch(ex) {
            console.error("Error creating checkout iframe.", ex);
        }
    }

    async _HandleSessionComplete() {
        // Destroy Checkout instance
        // this._DestroyCheckoutSession();
    
        // TODO
        /* 
        // Retrieve details from server (which loads Checkout Session)
        const details = await retrievePurchaseDetails();
    
        // Show custom purchase summary
        showPurchaseSummary(details);
        */

        // Send a checkout message
        this.OnCheckoutFinish();
    }

    _DestroyCheckoutSession() {
        this._checkout?.["destroy"]();
        this._checkout = null;
        this._checkoutIframe?.remove();
        this._checkoutIframe = null;
    }

    OnCheckoutStart() {
        this._triggerCheckoutStart = true;
        this.Trigger(C3.Plugins.ZalanceAPI.Cnds.OnCheckoutStart);
    };

    OnCheckoutFinish() {
        this._triggerCheckoutFinish = true;
        this.Trigger(C3.Plugins.ZalanceAPI.Cnds.OnCheckoutFinish);
    };

    OnWSCheckoutFinish(msgObj) {
        if(msgObj?.type === 'purchase') {
            this._isPurchased = true;
            const success = msgObj.payment_status === 'paid';

            // Trigger an event display
            const data = {
                type: success? 1 : 2,
                message: success? "Order complete!" : "Error while processing transaction.",
                duration: 5000,
            }

            this.OnCheckoutFinish();
        }

        if(this._mmWS) {
            this._mmWS.Close();
        }
    };
    
    SanitizePriceInputs(count, page) {
        // Sanitize inputs
        if(count < 0) {
            count = 1;
        }
        else if(count > MAX_PRICE_COUNT) {
            count = MAX_PRICE_COUNT;
        }

        if(page < 0) {
            page = 1;
        }

        return {count, page}
    }

    HandleSessionClose() {
        console.log('[Zalance] Purchase complete and session closed.');
    }

    _GoToURL(url, target) {
        this._PostToDOMMaybeSync("navigate", {
            "type": "url",
            "url": url,
            "target": target,
            "exportType": this._runtime.GetExportType()
        })
    }

    _GoToURLWindow(url, tag) {
        this._PostToDOMMaybeSync("navigate", {
            "type": "new-window",
            "url": url,
            "tag": tag,
            "exportType": this._runtime.GetExportType()
        })
    }

    async _HandleErrorResponse(response) {
        const responseObj = await response.json();

        this._errorMsg = responseObj.message;
        this._triggerError = true;
        this.Trigger(C3.Plugins.ZalanceAPI.Cnds.OnError);
        return false;
    }

    _GetLastError() {
        return this._errorMsg;
    }
	
    _SetAccountId(id)
	{
		this._accountId = id;
	}

	_GetAccountId()
	{
		return this._accountId;
	}

    _GetLastPrices()
	{
		return this._prices;
	}

    _GetNextPricePage()
	{
		return this._nextPricePage;
	}

    _GetCurrentPricePage()
	{
		return this._curPricePage;
	}

    _SetProjectId(n)
	{
		this._projectId = n;
	}

	_GetProjectId()
	{
		return this._projectId;
	}
	
	Release()
	{
		super.Release();
	}
	
	SaveToJson()
	{
		return {
			// data to be saved for savegames
		};
	}
	
	LoadFromJson(o)
	{
		// load state for savegames
		// this.UpdateElementState();		// ensures any state changes are updated in the DOM
	}

	GetScriptInterfaceClass()
	{
		return self.IMyZalanceAPIInstance;
	}
};  

// Script interface. Use a WeakMap to safely hide the internal implementation details from the
// caller using the script interface.
const map = new WeakMap();

self.IMyZalanceAPIInstance = class IMyZalanceAPIInstance extends self.IInstance {
	constructor()
	{
		super();
		
		// Map by SDK instance
		map.set(this, self.IInstance._GetInitInst().GetSdkInstance());
	}

    set projectId(n)
	{
		map.get(this)._SetProjectId(n);
	}

	get projectId()
	{
		return map.get(this)._GetProjectId();
	}

    StartCheckout(price_id, quantity, automatic_tax) {
        return map.get(this)._CreateCheckoutSession(price_id, quantity, automatic_tax);
    }

    StartCheckoutCart(line_items, automatic_tax) {
        return map.get(this)._CreateCheckoutSessionItems(line_items, automatic_tax);
    }
};


self.C3.Plugins.ZalanceAPI.Cnds =
{
	OnBuyClick()
	{
        // TODO
		return true;
	},
    OnPricesReceived()
    {
        if(this._triggerPricesReceived) {
            this._triggerPricesReceived = false;
            return true;
        }

        return false;
    },
    OnCheckoutStart()
	{
		if(this._triggerCheckoutStart) {
            this._triggerCheckoutStart = false;
            return true;
        }

        return false;
	},
    OnCheckoutFinish()
	{
        if(this._triggerCheckoutFinish) {
            this._triggerCheckoutFinish = false;
            return true;
        }

        return false;
	},
    OnOpened() {
        return true
    },
    OnClosed() {
        return true
    },
    OnError() {
        if(this._triggerError) {
            this._triggerError = false;
            return true;
        }

        return false;
    },
    OnMessage() {
        return true
    },
    OnBinaryMessage(objectClass) {
        if (!objectClass) {
            return false;
        }

        const inst = objectClass.GetFirstPicked(this._inst);
        if (!inst) {
            return false;
        }

        const sdkInst = inst.GetSdkInstance();
        sdkInst.SetArrayBufferTransfer(this._mmWS._ws?._messageBinary);
        return true;
    },
    IsOpen() {
        return this._mmWS._ws && this._mmWS._ws.readyState === 1;
    },
    IsConnecting() {
        return this._mmWS._ws && this._mmWS._ws.readyState === 0;
    },
    IsSupported() {
        return true;
    }
};

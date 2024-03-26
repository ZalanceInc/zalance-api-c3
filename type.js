
const SDK = self.SDK;

const PLUGIN_CLASS = SDK.Plugins.ZalanceAPI;

PLUGIN_CLASS.Type = class ZalanceAPIType extends SDK.ITypeBase
{
	constructor(sdkPlugin, iObjectType)
	{
		super(sdkPlugin, iObjectType);
	}
};

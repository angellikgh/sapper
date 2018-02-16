export type Route = {
	id: string;
	type: 'page' | 'route';
	file: string;
	pattern: RegExp;
	test: (url: string) => boolean;
	exec: (url: string) => Record<string, string>;
	parts: string[];
	dynamic: string[];
};

export type Template = {
	render: (data: Record<string, string>) => string;
	stream: (res, data: Record<string, string | Promise<string>>) => void;
};
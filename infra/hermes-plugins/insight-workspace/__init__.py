"""Register a script-only workspace worker CLI for the default profile."""

from .worker import command, setup_argparse


def register(ctx):
    ctx.register_cli_command(
        name="insight-workspace",
        help="Process typed Insight Google Workspace jobs without an agent",
        setup_fn=setup_argparse,
        handler_fn=command,
    )

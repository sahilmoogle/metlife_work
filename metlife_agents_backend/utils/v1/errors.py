class InternalServerException(Exception):
    """Raise when internal server error"""

    def __init__(self, message: str = None):
        self.message = message
